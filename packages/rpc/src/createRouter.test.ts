import { describe, expect, it } from 'bun:test';

import { createContainer } from '@nzyme/ioc/Container.js';

import { createRouter } from './createRouter.js';
import { defineEndpoint } from './defineEndpoint.js';
import { defineEndpointHandler } from './defineEndpointHandler.js';
import type { HttpRequest } from './types/HttpRequest.js';
import type { HttpResponse } from './types/HttpResponse.js';

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
