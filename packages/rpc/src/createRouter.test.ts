import { describe, expect, it } from 'bun:test';

import { createContainer } from '@nzyme/ioc/Container.js';

import { createRouter } from './createRouter.js';
import { defineEndpoint } from './defineEndpoint.js';
import { defineEndpointHandler } from './defineEndpointHandler.js';
import type { HttpContext } from './services/HttpContextProvider.js';
import { HttpContextProvider } from './services/HttpContextProvider.js';
import type { HttpRequest } from './types/HttpRequest.js';
import type { HttpResponse } from './types/HttpResponse.js';
import { CACHE_CONTROL_DISABLED } from './utils/cacheControl.js';

const pingEndpoint = defineEndpoint<void, { pong: true }>({
    name: 'ping',
});

function setup(options?: { beforeRequest?: (request: HttpRequest) => HttpResponse | undefined }) {
    let handlerCalls = 0;

    const pingHandler = defineEndpointHandler({
        endpoint: pingEndpoint,
        setup() {
            return () => {
                handlerCalls++;
                return { pong: true } as const;
            };
        },
    });

    const router = createRouter({
        container: createContainer(),
        handlers: [pingHandler],
        beforeRequest: options?.beforeRequest,
    });

    return { router, handlerCalls: () => handlerCalls };
}

function request(path: string): HttpRequest {
    return {
        path,
        method: 'GET',
        headers: {},
        ip: '127.0.0.1',
    };
}

const forbidden: HttpResponse = {
    status: 403,
    headers: {},
    body: JSON.stringify({ error: 'Forbidden' }),
};

describe('createRouter beforeRequest hook', () => {
    it('short-circuits with the override response and skips the handler', async () => {
        const { router, handlerCalls } = setup({ beforeRequest: () => forbidden });

        const response = await router.execute(request('ping'));

        expect(response.status).toBe(403);
        expect(handlerCalls()).toBe(0);
    });

    it('short-circuits before the not-found path', async () => {
        const { router } = setup({ beforeRequest: () => forbidden });

        const response = await router.execute(request('does-not-exist'));

        // Without the hook this would be a 404; the hook must run first.
        expect(response.status).toBe(403);
    });

    it('proceeds to the handler when the hook returns undefined', async () => {
        const { router, handlerCalls } = setup({ beforeRequest: () => undefined });

        const response = await router.execute(request('ping'));

        expect(response.status).toBe(200);
        expect(handlerCalls()).toBe(1);
    });

    it('routes normally when no hook is configured', async () => {
        const { router, handlerCalls } = setup();

        const response = await router.execute(request('ping'));

        expect(response.status).toBe(200);
        expect(handlerCalls()).toBe(1);
    });
});

const pageEndpoint = defineEndpoint<void, unknown>({
    name: 'page',
});

/**
 * Builds a router with one `page` endpoint whose handler receives the live HTTP context, so a test
 * can set headers the way a real handler does through {@link HttpContextProvider}.
 */
function setupPage(handle: (http: HttpContext) => unknown) {
    const pageHandler = defineEndpointHandler({
        endpoint: pageEndpoint,
        deps: { httpContextProvider: HttpContextProvider },
        setup({ httpContextProvider }) {
            return () => handle(httpContextProvider.get()!);
        },
    });

    return createRouter({ container: createContainer(), handlers: [pageHandler] });
}

async function readBlobBody(response: HttpResponse) {
    if (!(response.body instanceof Blob)) {
        throw new Error('Expected a Blob body');
    }

    return response.body.text();
}

describe('createRouter responses', () => {
    it('serialises a plain JSON result exactly as before', async () => {
        const { router } = setup();

        const response = await router.execute(request('ping'));

        expect(response).toEqual({
            status: 200,
            body: '{"pong":true}',
            headers: {
                'content-type': 'application/json',
                'cache-control': CACHE_CONTROL_DISABLED,
            },
        });
    });

    it('keeps cookies set through the HTTP context as an array on a JSON result', async () => {
        const router = setupPage(http => {
            http.response.headers['set-cookie'] = ['a=1; Path=/', 'b=2; Path=/'];
            return { ok: true };
        });

        const response = await router.execute(request('page'));

        expect(response.body).toBe('{"ok":true}');
        expect(response.headers['set-cookie']).toEqual(['a=1; Path=/', 'b=2; Path=/']);
    });

    it('keeps every Set-Cookie of a returned Response as its own entry', async () => {
        const router = setupPage(() => {
            const headers = new Headers({ 'content-type': 'text/html; charset=utf-8' });
            headers.append('set-cookie', 'a=1; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/');
            headers.append('set-cookie', 'b=2; Path=/');
            return new Response('<p>hi</p>', { status: 201, headers });
        });

        const response = await router.execute(request('page'));

        expect(response.status).toBe(201);
        expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
        expect(response.headers['set-cookie']).toEqual([
            'a=1; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/',
            'b=2; Path=/',
        ]);
        expect(await readBlobBody(response)).toBe('<p>hi</p>');
    });

    it('merges cookies set through the HTTP context with those of a returned Response', async () => {
        const router = setupPage(http => {
            http.response.headers['set-cookie'] = 'early=1; Path=/';
            http.response.headers['x-from-context'] = 'yes';
            return new Response('ok', { headers: { 'set-cookie': 'late=2; Path=/' } });
        });

        const response = await router.execute(request('page'));

        expect(response.headers['set-cookie']).toEqual(['early=1; Path=/', 'late=2; Path=/']);
        expect(response.headers['x-from-context']).toBe('yes');
    });
});
