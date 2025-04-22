import { FetchError } from '@nzyme/fetch-utils';
import type { HttpMethod, HttpRequestHeaders } from '@nzyme/fetch-utils';
import type { ValidationErrors } from '@nzyme/validation';
import { ValidationError } from '@nzyme/validation';
import * as z from '@nzyme/zchema';

import type { Endpoint, EndpointInput, EndpointOutput } from './defineEndpoint.js';

const PATH_PARAM_REGEX = /\/:([^/]+)/g;

/**
 * Options for the fetchEndpoint function, combining base options and parameter options.
 */
export type FetchEndpointOptions<E extends Endpoint> = FetchEndpointOptionsBase<E> &
    FetchEndpointOptionsParams<E>;

/**
 * Represents the request structure used in the fetchEndpoint function.
 */
export type FetchEndpointRequest = {
    /**
     * The body of the request, if any.
     */
    body?: string;
    /**
     * HTTP headers to be sent with the request.
     */
    headers: HttpRequestHeaders;
    /**
     * HTTP method to be used for the request (GET, POST, etc).
     */
    method: HttpMethod;
    /**
     * The URL to which the request will be sent.
     */
    url: string;
};

/**
 * Base options for fetchEndpoint function.
 */
type FetchEndpointOptionsBase<E extends Endpoint> = {
    /**
     * The endpoint definition to be used for the request.
     */
    endpoint: E;
    /**
     * Optional custom fetch implementation.
     */
    fetch?: (request: FetchEndpointRequest) => Promise<Response>;
    /**
     * Optional HTTP headers to be included in the request.
     */
    headers?: HttpRequestHeaders;
    /**
     * Optional base URL for the request.
     */
    url?: string;
};

/**
 * Parameter options for the fetchEndpoint function.
 * If the endpoint requires input parameters, they must be provided.
 */
type FetchEndpointOptionsParams<E extends Endpoint> =
    E extends Endpoint<undefined> ? { params?: undefined } : { params: EndpointInput<E> };

/**
 * Fetches data from an API endpoint with proper type validation.
 *
 * @param options - Configuration options for the request
 * @returns A promise that resolves to the endpoint's output type
 * @throws {ValidationError} When input validation fails or server returns validation errors
 * @throws {FetchError} When the server returns a non-200 response
 */
export async function fetchEndpoint<E extends Endpoint>(
    options: FetchEndpointOptions<E>,
): Promise<EndpointOutput<E>> {
    const endpoint = options.endpoint;
    const params = (options.params || {}) as Record<string, unknown>;
    const headers: HttpRequestHeaders = { ...options.headers };

    const request: FetchEndpointRequest = {
        method: endpoint.method,
        headers: headers,
        url: options.url || '',
    };

    if (endpoint.input) {
        if (!z.isSchema(endpoint.input)) {
            endpoint.input = z.object({ props: endpoint.input });
        }

        z.validateOrThrow(endpoint.input, params ?? {});
    }

    if (request.url.endsWith('/')) {
        request.url = request.url.slice(0, -1);
    }

    request.url += endpoint.path.replace(PATH_PARAM_REGEX, (_, param: string) => {
        const value = params[param];
        delete params[param];
        return `/${String(value)}`;
    });

    if (endpoint.method === 'GET' || endpoint.method === 'HEAD') {
        const query = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) {
            query.set(key, String(value));
        }

        if (query.size > 0) {
            request.url += `?${query.toString()}`;
        }
    } else {
        if (Object.keys(params).length > 0) {
            request.body = JSON.stringify(params);
            headers['Content-Type'] = 'application/json';
        }
    }

    const response = await (options.fetch || fetchRequest)(request);
    if (response.status === 400) {
        const result = (await response.json()) as {
            errors: ValidationErrors;
            message: string;
        };

        throw new ValidationError(result.message, result.errors);
    }

    if (!response.ok) {
        const message = await response.text();
        throw new FetchError(response, message);
    }

    if (endpoint.output) {
        const result = await response.json();
        return z.coerce(endpoint.output, result) as EndpointOutput<E>;
    }

    return undefined as EndpointOutput<E>;
}

function fetchRequest(request: FetchEndpointRequest) {
    return fetch(request.url, {
        method: request.method,
        headers: request.headers as RequestInit['headers'],
        body: request.body,
    });
}
