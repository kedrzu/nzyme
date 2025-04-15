import { beforeEach, expect, it } from 'vitest';

import { defineEndpoint } from '@nzyme/api-core';
import { HttpError } from '@nzyme/fetch-utils';
import type { Container } from '@nzyme/ioc';
import { createContainer } from '@nzyme/ioc';
import * as v from '@nzyme/validation';
import * as z from '@nzyme/zchema';

import { ApiRouter } from './ApiRouter.js';
import { defineEndpointHandler } from './defineEndpointHandler.js';

let container: Container;
let router: ApiRouter;

process.env.DEBUG = 'true';

beforeEach(() => {
    container = createContainer();
    router = container.resolve(ApiRouter);
});

it('should return 404 for non-existent endpoints', async () => {
    const response = await router.execute({
        method: 'GET',
        path: '/non-existent',
        headers: {},
    });

    expect(response.status).toBe(404);
    expect(response.body).toBeTypeOf('string');
    expect(JSON.parse(response.body as string)).toEqual({
        error: 'NotFound',
        message: 'No endpoint found for GET /non-existent',
    });
});

it('should handle GET requests with query parameters', async () => {
    const endpoint = defineEndpoint({
        method: 'GET',
        path: '/test',
        input: {
            name: z.string(),
        },
        output: z.object({
            props: {
                name: z.string(),
                success: z.boolean(),
            },
        }),
    });

    const handler = defineEndpointHandler(endpoint, {
        setup() {
            return ({ name }) => ({
                name,
                success: true,
            });
        },
    });

    router.addEndpoint(handler);

    const response = await router.execute({
        method: 'GET',
        path: '/test',
        headers: {},
        query: { name: 'test' },
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body as string)).toEqual({ success: true, name: 'test' });
});

it('should handle POST requests with JSON body', async () => {
    const endpoint = defineEndpoint({
        method: 'POST',
        path: '/test',
        input: {
            data: z.string(),
        },
        output: z.object({
            props: {
                success: z.boolean(),
            },
        }),
    });

    const handler = defineEndpointHandler(endpoint, {
        setup() {
            return ({ data }) => ({
                success: true,
                data,
            });
        },
    });

    router.addEndpoint(handler);

    const response = await router.execute({
        method: 'POST',
        path: '/test',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ data: 'test' }),
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body as string)).toEqual({ success: true, data: 'test' });
});

it('should handle path parameters', async () => {
    const endpoint = defineEndpoint({
        method: 'GET',
        path: '/users/:id',
        input: {
            id: z.string(),
        },
        output: z.object({
            props: {
                success: z.boolean(),
            },
        }),
    });

    const handler = defineEndpointHandler(endpoint, {
        setup() {
            return ({ id }) => ({
                success: true,
                id,
            });
        },
    });

    router.addEndpoint(handler);

    const response = await router.execute({
        method: 'GET',
        path: '/users/123',
        headers: {},
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body as string)).toEqual({ success: true, id: '123' });
});

it('should handle validation errors', async () => {
    const endpoint = defineEndpoint({
        method: 'POST',
        path: '/test',
        input: {
            required: z.string({
                validators: [v.required()],
            }),
        },
        output: z.object({
            props: {
                success: z.boolean(),
            },
        }),
    });

    const handler = defineEndpointHandler(endpoint, {
        setup() {
            return () => ({
                success: true,
            });
        },
    });

    router.addEndpoint(handler);

    const response = await router.execute({
        method: 'POST',
        path: '/test',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
    expect(JSON.parse(response.body as string)).toHaveProperty('error', 'ValidationError');
});

it('should handle HTTP errors', async () => {
    const endpoint = defineEndpoint({
        method: 'GET',
        path: '/test',
        output: z.object({
            props: {
                success: z.boolean(),
            },
        }),
    });

    const handler = defineEndpointHandler(endpoint, {
        setup() {
            return () => {
                throw new HttpError(403, 'Forbidden');
            };
        },
    });

    router.addEndpoint(handler);

    const response = await router.execute({
        method: 'GET',
        path: '/test',
        headers: {},
    });

    expect(response.status).toBe(403);
    expect(JSON.parse(response.body as string)).toEqual({
        error: 'HttpError',
        message: 'Forbidden',
        stack: expect.any(String) as string,
    });
});

it('should handle unhandled errors', async () => {
    const endpoint = defineEndpoint({
        method: 'GET',
        path: '/test',
        output: z.object({
            props: {
                success: z.boolean(),
            },
        }),
    });

    const handler = defineEndpointHandler(endpoint, {
        setup() {
            return () => {
                throw new Error('Unexpected error');
            };
        },
    });

    router.addEndpoint(handler);

    const response = await router.execute({
        method: 'GET',
        path: '/test',
        headers: {},
    });

    expect(response.status).toBe(500);
    expect(JSON.parse(response.body as string)).toEqual({
        error: 'Error',
        message: 'Unexpected error',
        stack: expect.any(String) as string,
    });
});
