import { createServer } from 'node:http';
import type { Server } from 'node:http';

import { afterEach, describe, expect, it } from 'bun:test';

import { createContainer } from '@nzyme/ioc/Container.js';

import { createMiddleware } from './createMiddleware.js';
import { createRouter } from './createRouter.js';
import { defineEndpoint } from './defineEndpoint.js';
import { defineEndpointHandler } from './defineEndpointHandler.js';
import { HttpContextProvider } from './services/HttpContextProvider.js';
import type { HttpContext } from './services/HttpContextProvider.js';
import { CACHE_CONTROL_DISABLED } from './utils/cacheControl.js';

const testEndpoint = defineEndpoint<void, unknown>({
    name: 'test',
});

let server: Server | undefined;

afterEach(() => {
    server?.close();
    server = undefined;
});

/**
 * Serves a real router with one `test` endpoint through the middleware on an ephemeral port and
 * fetches that endpoint, so assertions see exactly what reaches an HTTP client.
 */
async function fetchFromMiddleware(handle: (http: HttpContext) => unknown) {
    const handler = defineEndpointHandler({
        endpoint: testEndpoint,
        deps: { httpContextProvider: HttpContextProvider },
        setup({ httpContextProvider }) {
            return () => handle(httpContextProvider.get()!);
        },
    });

    const router = createRouter({ container: createContainer(), handlers: [handler] });
    const listening = createServer(createMiddleware({ router }));
    server = listening;

    await new Promise<void>(resolve => {
        listening.listen(0, '127.0.0.1', resolve);
    });
    const address = listening.address();
    if (address === null || typeof address === 'string') {
        throw new Error('Expected the server to listen on a TCP port');
    }

    return fetch(`http://127.0.0.1:${address.port}/test`);
}

describe('createMiddleware', () => {
    it('writes a plain JSON result exactly as before', async () => {
        const response = await fetchFromMiddleware(() => ({ ok: true }));

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('application/json');
        expect(response.headers.get('cache-control')).toBe(CACHE_CONTROL_DISABLED);
        expect(await response.text()).toBe('{"ok":true}');
    });

    it('sends every cookie of a JSON result as its own Set-Cookie header', async () => {
        const response = await fetchFromMiddleware(http => {
            http.response.headers['set-cookie'] = ['a=1; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/', 'b=2; Path=/'];
            return { ok: true };
        });

        expect(response.headers.getSetCookie()).toEqual([
            'a=1; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/',
            'b=2; Path=/',
        ]);
    });

    it('writes the real body and every cookie of a returned Response', async () => {
        const response = await fetchFromMiddleware(() => {
            const headers = new Headers({ 'content-type': 'text/html; charset=utf-8' });
            headers.append('set-cookie', 'a=1; Path=/');
            headers.append('set-cookie', 'b=2; Path=/');
            return new Response('<!doctype html><p>zażółć</p>', { status: 201, headers });
        });

        expect(response.status).toBe(201);
        expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
        expect(response.headers.getSetCookie()).toEqual(['a=1; Path=/', 'b=2; Path=/']);
        expect(await response.text()).toBe('<!doctype html><p>zażółć</p>');
    });

    it('writes a binary Response body byte for byte', async () => {
        const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);
        const response = await fetchFromMiddleware(
            () => new Response(bytes, { headers: { 'content-type': 'image/png' } }),
        );

        expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    });
});
