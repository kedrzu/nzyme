import type { QueryObject } from 'ufo';
import { withQuery } from 'ufo';

import { FetchError } from './FetchError.js';

/**
 * Base configuration for all JSON fetch requests
 */
interface BaseRequest {
    /** The target URL for the request */
    url: string;
    /** Optional query parameters to append to the URL */
    query?: QueryObject;
    /** Optional request headers */
    headers?: Record<string, string>;
}

/**
 * Configuration for methods that include a request body
 */
interface DataRequest extends BaseRequest {
    /** HTTP method for requests with a body */
    method: 'PATCH' | 'POST' | 'PUT';
    /** Optional data to be sent as JSON */
    data?: unknown;
}

/**
 * Configuration for methods that don't include a request body
 */
interface SimpleRequest extends BaseRequest {
    /** HTTP method for requests without a body */
    method?: 'DELETE' | 'GET' | 'HEAD';
    /** Explicitly prevent data for these methods */
    data?: never;
}

/**
 * Performs a fetch request with JSON handling for both request and response.
 * Automatically handles query parameters, JSON serialization, and common status codes.
 *
 * @param request - The request configuration
 * @returns A promise that resolves to the parsed JSON response, or null for 204 responses
 * @throws {FetchError} If the response status is not ok
 */
export async function fetchJson<T>(request: DataRequest | SimpleRequest) {
    const headers: Record<string, string> = { ...request.headers };
    let url = request.url;
    if (request.query) {
        url = withQuery(url, request.query);
    }

    const requestInit: RequestInit = {
        method: request.method || 'GET',
        headers: headers,
    };

    if (request.data) {
        headers['Content-Type'] = 'application/json';
        requestInit.body = JSON.stringify(request.data);
    }

    const response = await fetch(url, requestInit);
    if (!response.ok) {
        throw new FetchError(response);
    }

    if (response.status === 204) {
        return null;
    }

    return (await response.json()) as T;
}
