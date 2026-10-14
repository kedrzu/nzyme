import { describe, expect, it } from 'bun:test';

import { createContainer } from '@nzyme/ioc/Container.js';
import { createRouter } from '@nzyme/rpc/createRouter.js';
import type { Router } from '@nzyme/rpc/createRouter.js';
import { defineEndpoint } from '@nzyme/rpc/defineEndpoint.js';
import { defineEndpointHandler } from '@nzyme/rpc/defineEndpointHandler.js';
import { HttpContextProvider } from '@nzyme/rpc/services/HttpContextProvider.js';
import type { HttpContext } from '@nzyme/rpc/services/HttpContextProvider.js';
import type { HttpRequest } from '@nzyme/rpc/types/HttpRequest.js';
import { CACHE_CONTROL_DISABLED } from '@nzyme/rpc/utils/cacheControl.js';
import { createEventEmitter } from '@nzyme/utils/createEventEmitter.js';

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

describe('executeLambdaRpcApiV2 request body', () => {
    // Must protect: a body delivered base64-encoded reaches the router as the UTF-8 text the client sent.
    it('decodes a base64-encoded body to UTF-8 before routing', async () => {
        const body = '{"action":"create","title":"Zażółć gęślą jaźń"}';
        const requests = await executeWithBody({
            body: Buffer.from(body, 'utf8').toString('base64'),
            isBase64Encoded: true,
        });

        expect(requests.map(request => request.body)).toEqual([body]);
    });

    // Must protect: a plain body is passed through untouched.
    it('passes a plain body through unchanged', async () => {
        const body = '{"action":"create"}';
        const requests = await executeWithBody({ body, isBase64Encoded: false });

        expect(requests.map(request => request.body)).toEqual([body]);
    });

    it('passes an absent body through as undefined', async () => {
        const requests = await executeWithBody({ body: undefined, isBase64Encoded: true });

        expect(requests.map(request => request.body)).toEqual([undefined]);
    });
});

async function executeWithBody(params: { body: string | undefined; isBase64Encoded: boolean }) {
    const requests: HttpRequest[] = [];
    const router: Router = {
        execute(request) {
            requests.push(request);
            return Promise.resolve({ status: 200, headers: {}, body: '' });
        },
        events: { error: createEventEmitter<unknown>().event },
    };

    await executeLambdaRpcApiV2(router, createBodyEvent(params));

    return requests;
}

function createBodyEvent(params: { body: string | undefined; isBase64Encoded: boolean }): types.APIGatewayProxyEventV2 {
    return {
        version: '2.0',
        routeKey: '$default',
        rawPath: '/webhook',
        rawQueryString: '',
        headers: { 'content-type': 'application/json' },
        requestContext: {
            accountId: '123456789012',
            apiId: 'api-id',
            domainName: 'example.lambda-url.eu-central-1.on.aws',
            domainPrefix: 'example',
            http: {
                method: 'POST',
                path: '/webhook',
                protocol: 'HTTP/1.1',
                sourceIp: '127.0.0.1',
                userAgent: 'test',
            },
            requestId: 'request-id',
            routeKey: '$default',
            stage: '$default',
            time: '09/Oct/2026:12:00:00 +0000',
            timeEpoch: 1_791_547_200_000,
        },
        body: params.body,
        isBase64Encoded: params.isBase64Encoded,
    };
}
