import { HttpError } from '@nzyme/fetch-utils/HttpError.js';
import type { HttpResponseHeaders } from '@nzyme/fetch-utils/HttpHeaders.js';
import type { Container } from '@nzyme/ioc/Container.js';
import { createEventEmitter } from '@nzyme/utils/createEventEmitter.js';
import type { EventEmitter } from '@nzyme/utils/createEventEmitter.js';

import type { EndpointHandlerService } from './defineEndpointHandler.js';
import { HttpContextProvider } from './services/HttpContextProvider.js';
import type { HttpRequest } from './types/HttpRequest.js';
import type { HttpResponse } from './types/HttpResponse.js';
import type { RpcErrorData } from './types/RpcError.js';
import { createJsonResponse } from './utils/createJsonResponse.js';

/**
 * Events emitted by the API router during request processing.
 */
export interface RouterEvents {
    /**
     * An event emitter for errors.
     * @type {EventEmitter<unknown>}
     * @param {unknown} error - The error that occurred
     */
    error: EventEmitter<unknown>;
}

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
    execute(request: HttpRequest): Promise<HttpResponse>;

    /**
     * Events emitted by the router.
     */
    events: RouterEvents;
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
     * An array of endpoint handler services to register with the router.
     */
    handlers: readonly EndpointHandlerService[];

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
 * Creates an API router that maps incoming HTTP requests to registered endpoint handlers.
 * @__NO_SIDE_EFFECTS__
 */
export function createRouter(options: RouterOptions): Router {
    const handlers = new Map<string, EndpointHandlerService>();
    const eventError = createEventEmitter<unknown>();
    const httpContextProvider = options.container.resolve(HttpContextProvider);
    const basePath = options.basePath ?? '/';
    const container = options.container;
    const stackTraces = options.stackTraces ?? false;

    for (const handler of options.handlers) {
        handlers.set(handler.endpoint.name, handler);
    }

    return {
        execute,
        events: {
            error: eventError.event,
        },
    };

    async function execute(request: HttpRequest): Promise<HttpResponse> {
        try {
            const endpointName = request.path.startsWith(basePath) ? request.path.slice(basePath.length) : request.path;
            const handler = handlers.get(endpointName);
            const httpContext = httpContextProvider.setRequest(request);

            if (!handler) {
                return createJsonResponse({
                    body: {
                        error: 'NotFound',
                        message: `No endpoint found for ${request.method} ${request.path}`,
                    },
                    status: 404,
                });
            }

            const input = await parseInput(handler, request);

            if (input?.issues) {
                return createJsonResponse({
                    status: 400,
                    body: {
                        error: 'InvalidInput',
                        issues: input.issues,
                    },
                });
            }

            const handlerInstance = container.resolve(handler);
            const result = await handlerInstance(input?.value, { request });

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
                // Cache only if no authorization header is not present
                // We don't want to cache anything that is user-specific.
                cache:
                    request.method === 'GET' && !request.headers['authorization'] && !!request.headers['cache-control'],
                headers: httpContext.response.headers,
                status: 200,
            });
        } catch (error) {
            if (error instanceof HttpError) {
                return createJsonResponse<RpcErrorData>({
                    body: {
                        error: error.name,
                        stack: stackTraces ? error.stack : undefined,
                        ...error.payload,
                    },
                    status: error.status,
                });
            }

            eventError.emit(error);

            if (error instanceof Error) {
                return createJsonResponse<RpcErrorData>({
                    body: {
                        error: error.name,
                        message: error.message,
                        stack: stackTraces ? error.stack : undefined,
                    },
                    status: 500,
                });
            }

            return createJsonResponse<RpcErrorData>({
                body: {
                    error: 'UnknownError',
                    message: 'Unknown error',
                },
                status: 500,
            });
        }
    }

    async function parseInput(handler: EndpointHandlerService, request: HttpRequest) {
        if (!handler.endpoint.input) {
            return;
        }

        const body = request.body ? parseJson(request.body) : null;
        const input = await handler.endpoint.input['~standard'].validate(body);

        return input;
    }
}

/**
 * Safely parses a JSON string, throwing an HTTP 400 error on invalid input.
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
