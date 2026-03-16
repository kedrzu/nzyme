import { getMd5Hash } from '@nzyme/crypto';
import type { HttpResponseHeaders } from '@nzyme/fetch-utils/HttpHeaders.js';
import { toJsonString } from '@nzyme/utils/toJsonString.js';

import type { HttpResponse } from '../types/HttpResponse.js';
import { CACHE_CONTROL_DISABLED } from './cacheControl.js';

/**
 * Options for building a JSON HTTP response, including optional caching.
 */
export type JsonResponse<T> = {
    /** The response body to serialize as JSON */
    body: T;
    /** When true, sets an ETag header for cache validation */
    cache?: boolean;
    /** Additional response headers to include */
    headers?: HttpResponseHeaders;
    /** HTTP status code for the response */
    status: number;
};

/**
 * Serializes a response body to JSON and builds an HTTP response with appropriate headers.
 */
export function createJsonResponse<T = unknown>(response: JsonResponse<T>): HttpResponse {
    const body = toJsonString(response.body);

    const headers = {
        ...response.headers,
        'content-type': 'application/json',
    };

    if (response.cache) {
        headers['etag'] = getMd5Hash(body);
    } else {
        headers['cache-control'] = CACHE_CONTROL_DISABLED;
    }

    return {
        status: response.status,
        body,
        headers,
    };
}
