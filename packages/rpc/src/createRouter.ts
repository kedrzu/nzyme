import type { HttpResponseHeaders } from '@nzyme/fetch-utils';
import { HttpError } from '@nzyme/fetch-utils';
import type { Container } from '@nzyme/ioc';
import { Logger } from '@nzyme/logging';

import type { Endpoint } from './defineEndpoint.js';
import type { Serializer } from './Serializer.js';
import { HttpContextProvider } from './services/HttpContextProvider.js';
import type { HttpRequest } from './types/HttpRequest.js';
import type { HttpResponse } from './types/HttpResponse.js';
import { createJsonResponse } from './utils/createJsonResponse.js';

/**
 * Interface for the API router responsible for registering endpoints and handling HTTP requests.
 * The router maps incoming requests to the appropriate endpoint handlers and processes their results.
 */
export interface Router {
    /**
     * Processes an HTTP request and returns an HTTP response.
     * This method handles routing, input validation, endpoint execution, and error handling.
     *
     * @param request - The HTTP request to process
     * @returns A promise that resolves to an HTTP response
     */
    (request: HttpRequest): Promise<HttpResponse>;
}

/**
 * Configuration options for creating an API router.
 */
export interface RouterOptions {
    /**
     * The dependency injection container used to resolve endpoint handlers.
     */
    container: Container;

    /**
     * An array of endpoint handlers to register with the router initially.
     */
    endpoints: readonly Endpoint[];

    /**
     *
     */
    serializer: Serializer;

    /**
     * Whether to include stack traces in the response.
     */
    stackTraces?: boolean;

    /**
     * The base path to use for the router.
     * @default '/'
     */
    basePath?: string;
}

/**
 *
 */
export function createRouter(options: RouterOptions): Router {
    const endpoints = new Map<string, Endpoint>();
    const logger = options.container.resolve(Logger);
    const httpContextProvider = options.container.resolve(HttpContextProvider);
    const basePath = options.basePath ?? '/';
    const container = options.container;
    const serializer = options.serializer;
    const stackTraces = options.stackTraces ?? false;

    for (const endpoint of options.endpoints) {
        endpoints.set(endpoint.name, endpoint);
    }

    return execute;

    async function execute(request: HttpRequest): Promise<HttpResponse> {
        logger.context('request', request);

        try {
            const endpointName = request.path.startsWith(basePath) ? request.path.slice(basePath.length) : request.path;
            const endpoint = endpoints.get(endpointName);
            const httpContext = httpContextProvider.setRequest(request);

            if (!endpoint) {
                return createJsonResponse({
                    body: {
                        error: 'NotFound',
                        message: `No endpoint found for ${request.method} ${request.path}`,
                    },
                    status: 404,
                    serializer,
                });
            }

            const input = await parseInput(endpoint, request);
            if (input) {
                logger.context('input', input);
            }

            if (input?.issues) {
                return createJsonResponse({
                    status: 400,
                    body: {
                        error: 'InvalidInput',
                        issues: input.issues,
                    },
                    serializer,
                });
            }

            const handlerInstance = container.resolve(endpoint);
            const result = await handlerInstance(input?.value);

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
                body: result,
                serializer,
                // Cache only if no authorization header is not present
                // We don't want to cache anything that is user-specific.
                cache:
                    request.method === 'GET' && !request.headers['authorization'] && !!request.headers['cache-control'],
                headers: httpContext.response.headers,
                status: 200,
            });
        } catch (error) {
            if (error instanceof HttpError) {
                return createJsonResponse({
                    body: {
                        error: error.name,
                        stack: stackTraces ? error.stack : undefined,
                        ...error.payload,
                    },
                    status: error.status,
                    serializer,
                });
            }

            logger.error('Unhandled error', { error });

            if (error instanceof Error) {
                return createJsonResponse({
                    body: {
                        error: error.name,
                        message: error.message,
                        stack: stackTraces ? error.stack : undefined,
                    },
                    status: 500,
                    serializer,
                });
            }

            return createJsonResponse({
                body: {
                    error: 'UnknownError',
                    message: 'Unknown error',
                },
                status: 500,
                serializer,
            });
        }
    }

    async function parseInput(endpoint: Endpoint, request: HttpRequest) {
        if (!endpoint.input) {
            return;
        }

        const body = request.body ? parseJson(request.body) : null;
        const input = await endpoint.input['~standard'].validate(body);

        return input;
    }
}
/**
 *
 */
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
