import { describe, expect, it } from 'bun:test';

import { createContainer } from '@nzyme/ioc/Container.js';
import { createRouter } from '@nzyme/rpc/createRouter.js';
import { defineEndpoint } from '@nzyme/rpc/defineEndpoint.js';
import { defineEndpointHandler } from '@nzyme/rpc/defineEndpointHandler.js';
import { HttpContextProvider } from '@nzyme/rpc/services/HttpContextProvider.js';
import type { HttpContext } from '@nzyme/rpc/services/HttpContextProvider.js';
import { CACHE_CONTROL_DISABLED } from '@nzyme/rpc/utils/cacheControl.js';

import { executeLambdaRpcApiV2 } from './executeLambdaRpcApiV2.js';
import type { types } from './types.js';

const testEndpoint = defineEndpoint<void, unknown>({
    name: 'test',
});

/**
 * Builds a real router with one `test` endpoint whose handler receives the live HTTP context, and
 * runs a payload-2.0 event for it through the adapter.
 */
function execute(handle: (http: HttpContext) => unknown, event: Partial<types.APIGatewayProxyEventV2> = {}) {
    const handler = defineEndpointHandler({
        endpoint: testEndpoint,
        deps: { httpContextProvider: HttpContextProvider },
        setup({ httpContextProvider }) {
            return () => handle(httpContextProvider.get()!);
        },
    });

    const router = createRouter({ container: createContainer(), handlers: [handler] });

    return executeLambdaRpcApiV2(router, { ...createEvent('test'), ...event });
}

function createEvent(path: string): types.APIGatewayProxyEventV2 {
    return {
        version: '2.0',
        routeKey: 'GET /{proxy+}',
        rawPath: `/${path}`,
        rawQueryString: '',
        headers: {},
        pathParameters: { proxy: path },
        isBase64Encoded: false,
        requestContext: {
            accountId: '123456789012',
            apiId: 'api',
            domainName: 'api.example.com',
            domainPrefix: 'api',
            http: {
                method: 'GET',
                path: `/${path}`,
                protocol: 'HTTP/1.1',
                sourceIp: '127.0.0.1',
                userAgent: 'test',
            },
            requestId: 'request',
            routeKey: 'GET /{proxy+}',
            stage: '$default',
            time: '09/Oct/2026:00:00:00 +0000',
            timeEpoch: 0,
        },
    };
}

describe('executeLambdaRpcApiV2', () => {
    it('returns a plain JSON result exactly as before', async () => {
        const result = await execute(() => ({ ok: true }));

        expect(result).toEqual({
            statusCode: 200,
            body: '{"ok":true}',
            headers: {
                'content-type': 'application/json',
                'cache-control': CACHE_CONTROL_DISABLED,
            },
        });
    });

    it('passes the request cookies of the cookies field to the handler as one cookie header', async () => {
        let cookie: unknown;
        await execute(
            http => {
                cookie = http.request.headers['cookie'];
                return null;
            },
            { cookies: ['a=1', 'b=%7B%22x%22%3A1%7D'] },
        );

        expect(cookie).toBe('a=1; b=%7B%22x%22%3A1%7D');
    });

    it('merges the cookies field with a cookie header already on the request', async () => {
        let cookie: unknown;
        await execute(
            http => {
                cookie = http.request.headers['cookie'];
                return null;
            },
            { headers: { cookie: 'a=1' }, cookies: ['b=2'] },
        );

        expect(cookie).toBe('a=1; b=2');
    });

    it('sends every cookie of a JSON result through the cookies field, not a joined header', async () => {
        const result = await execute(http => {
            http.response.headers['set-cookie'] = ['a=1; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/', 'b=2; Path=/'];
            return { ok: true };
        });

        expect(result.cookies).toEqual(['a=1; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/', 'b=2; Path=/']);
        expect(result.headers?.['set-cookie']).toBeUndefined();
    });

    it('sends a single cookie set as a string through the cookies field', async () => {
        const result = await execute(http => {
            http.response.headers['set-cookie'] = 'a=1; Path=/';
            return { ok: true };
        });

        expect(result.cookies).toEqual(['a=1; Path=/']);
        expect(result.headers?.['set-cookie']).toBeUndefined();
    });

    it('returns the real text body and every cookie of a returned HTML Response', async () => {
        const result = await execute(() => {
            const headers = new Headers({ 'content-type': 'text/html; charset=utf-8' });
            headers.append('set-cookie', 'a=1; Path=/');
            headers.append('set-cookie', 'b=2; Path=/');
            return new Response('<!doctype html><p>zażółć</p>', { headers });
        });

        expect(result.statusCode).toBe(200);
        expect(result.body).toBe('<!doctype html><p>zażółć</p>');
        expect(result.isBase64Encoded).toBeUndefined();
        expect(result.headers?.['content-type']).toBe('text/html; charset=utf-8');
        expect(result.cookies).toEqual(['a=1; Path=/', 'b=2; Path=/']);
    });

    it('returns a +json Response body as text', async () => {
        const result = await execute(
            () => new Response('{"a":1}', { headers: { 'content-type': 'application/problem+json' } }),
        );

        expect(result.body).toBe('{"a":1}');
        expect(result.isBase64Encoded).toBeUndefined();
    });

    it('base64-encodes a binary Response body and flags it', async () => {
        const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);
        const result = await execute(() => new Response(bytes, { headers: { 'content-type': 'image/png' } }));

        expect(result.isBase64Encoded).toBe(true);
        expect(result.body).toBe(Buffer.from(bytes).toString('base64'));
        expect(result.cookies).toBeUndefined();
    });
});
