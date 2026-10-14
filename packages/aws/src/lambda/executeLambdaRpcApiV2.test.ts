import { describe, expect, test } from 'bun:test';

import type { Router } from '@nzyme/rpc/createRouter.js';
import type { HttpRequest } from '@nzyme/rpc/types/HttpRequest.js';
import { createEventEmitter } from '@nzyme/utils/createEventEmitter.js';

import { executeLambdaRpcApiV2 } from './executeLambdaRpcApiV2.js';
import type { types } from './types.js';

describe('executeLambdaRpcApiV2', () => {
    // Must protect: a body delivered base64-encoded reaches the router as the UTF-8 text the client sent.
    test('decodes a base64-encoded body to UTF-8 before routing', async () => {
        const body = '{"action":"create","title":"Zażółć gęślą jaźń"}';
        const requests = await executeWith({
            body: Buffer.from(body, 'utf8').toString('base64'),
            isBase64Encoded: true,
        });

        expect(requests.map(request => request.body)).toEqual([body]);
    });

    // Must protect: a plain body is passed through untouched.
    test('passes a plain body through unchanged', async () => {
        const body = '{"action":"create"}';
        const requests = await executeWith({ body, isBase64Encoded: false });

        expect(requests.map(request => request.body)).toEqual([body]);
    });

    test('passes an absent body through as undefined', async () => {
        const requests = await executeWith({ body: undefined, isBase64Encoded: true });

        expect(requests.map(request => request.body)).toEqual([undefined]);
    });
});

async function executeWith(params: { body: string | undefined; isBase64Encoded: boolean }) {
    const requests: HttpRequest[] = [];
    const router: Router = {
        execute(request) {
            requests.push(request);
            return Promise.resolve({ status: 200, headers: {}, body: '' });
        },
        events: { error: createEventEmitter<unknown>().event },
    };

    await executeLambdaRpcApiV2(router, createEvent(params));

    return requests;
}

function createEvent(params: { body: string | undefined; isBase64Encoded: boolean }): types.APIGatewayProxyEventV2 {
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
