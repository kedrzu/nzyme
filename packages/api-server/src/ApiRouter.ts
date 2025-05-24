import { addRoute, createRouter, findRoute } from 'rou3';

import type { Endpoint } from '@nzyme/api-core';
import type { HttpResponseHeaders } from '@nzyme/fetch-utils';
import { HttpError } from '@nzyme/fetch-utils';
import { Container, defineService, envVariable } from '@nzyme/ioc';
import { Logger } from '@nzyme/logging';
import { isPlainObject } from '@nzyme/utils';
import { ValidationError } from '@nzyme/validation';
import * as z from '@nzyme/zchema';

import type { EndpointHandler } from './defineEndpointHandler.js';
import { HttpContextProvider } from './services/HttpContextProvider.js';
import type { HttpRequest } from './types/HttpRequest.js';
import type { HttpResponse } from './types/HttpResponse.js';
import { createJsonResponse } from './utils/createJsonResponse.js';

/**
 * Interface for the API router responsible for registering endpoints and handling HTTP requests.
 * The router maps incoming requests to the appropriate endpoint handlers and processes their results.
 */
export interface ApiRouter {
    /**
     * Registers an endpoint handler with the router.
     *
     * @param endpoint - The endpoint handler to register
     */
    addEndpoint(endpoint: EndpointHandler): void;

    /**
     * Processes an HTTP request and returns an HTTP response.
     * This method handles routing, input validation, endpoint execution, and error handling.
     *
     * @param request - The HTTP request to process
     * @returns A promise that resolves to an HTTP response
     */
    execute(request: HttpRequest): Promise<HttpResponse>;
}

/**
 * Configuration options for creating an API router.
 */
export interface ApiRouterOptions {
    /**
     * The dependency injection container used to resolve endpoint handlers.
     */
    container: Container;

    /**
     * An array of endpoint handlers to register with the router initially.
     */
    endpoints: EndpointHandler[];
}

/**
 * Service definition for the API router that handles HTTP requests and routes them to the appropriate endpoint handlers.
 */
export const ApiRouter = defineService({
    deps: {
        container: Container,
        httpContextProvider: HttpContextProvider,
        logger: Logger,
        debug: envVariable('API_DEBUG'),
    },
    name: 'ApiRouter',
    setup({ container, httpContextProvider, logger, debug }): ApiRouter {
        const router = createRouter<EndpointHandler>();

        return {
            addEndpoint(endpoint) {
                addRoute(router, endpoint.method, endpoint.path, endpoint);
            },
            execute,
        };

        async function execute(request: HttpRequest): Promise<HttpResponse> {
            logger.context('request', request);

            try {
                const route = findRoute(router, request.method, request.path);
                const httpContext = httpContextProvider.setRequest(request);

                if (!route) {
                    return createJsonResponse({
                        body: {
                            error: 'NotFound',
                            message: `No endpoint found for ${request.method} ${request.path}`,
                        },
                        status: 404,
                    });
                }

                const handler = route.data;
                const input = parseInput(handler, request, route.params);

                if (input) {
                    logger.context('input', input);
                }

                const handlerInstance = container.resolve(handler);
                const result = await handlerInstance(input, request);

                if (result instanceof Response) {
                    const headers: HttpResponseHeaders = httpContext.response.headers;

                    result.headers.forEach((value, key) => {
                        headers[key] = value;
                    });

                    return {
                        body: await result.blob(),
                        headers,
                        status: result.status,
                        statusText: result.statusText,
                    };
                }

                return createJsonResponse({
                    body: handler.output ? z.serialize(handler.output, result) : undefined,
                    // Cache only if no authorization header is not present
                    // We don't want to cache anything that is user-specific.
                    cache:
                        request.method === 'GET' &&
                        !request.headers['authorization'] &&
                        !!request.headers['cache-control'],
                    headers: httpContext.response.headers,
                    status: 200,
                });
            } catch (error) {
                if (error instanceof HttpError) {
                    return createJsonResponse({
                        body: {
                            error: error.name,
                            stack: debug ? error.stack : undefined,
                            ...error.payload,
                        },
                        status: error.status,
                    });
                }

                if (error instanceof ValidationError) {
                    return createJsonResponse({
                        body: {
                            error: error.name,
                            errors: error.errors,
                            message: error.message,
                            stack: debug ? error.stack : undefined,
                        },
                        status: 400,
                    });
                }

                logger.error('Unhandled error', { error });

                if (error instanceof Error) {
                    return createJsonResponse({
                        body: {
                            error: error.name,
                            message: error.message,
                            stack: debug ? error.stack : undefined,
                        },
                        status: 500,
                    });
                }

                return createJsonResponse({
                    body: {
                        error: 'UnknownError',
                        message: 'Unknown error',
                    },
                    status: 500,
                });
            }
        }

        function parseInput(endpoint: Endpoint, request: HttpRequest, params?: Record<string, string>) {
            if (!endpoint.input) {
                return null;
            }

            const input: Record<string, unknown> = {
                ...request.query,
            };

            if (request.body) {
                const body = parseJson(request.body);
                if (body && !isPlainObject(body)) {
                    throw new HttpError(400, 'Invalid body input, expected a JSON object');
                }

                Object.assign(input, body);
            }

            Object.assign(input, params);

            if (!z.isSchema(endpoint.input)) {
                endpoint.input = z.object({ props: endpoint.input });
            }

            const deserialized = z.coerce(endpoint.input, input);
            z.validateOrThrow(endpoint.input, deserialized);
            return deserialized;
        }

        function parseJson(input: string | null | undefined): unknown {
            if (input == null) {
                return null;
            }

            try {
                return JSON.parse(input);
            } catch {
                throw new HttpError(400, 'Invalid JSON');
            }
        }
    },
});
