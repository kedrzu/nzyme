import { getMd5Hash } from '@nzyme/crypto';
import type { HttpResponseHeaders } from '@nzyme/fetch-utils';
import { toJsonString } from '@nzyme/utils';

import type { HttpResponse } from '../types/HttpResponse.js';
import { CACHE_CONTROL_DISABLED } from './cacheControl.js';

/**
 *
 */
export type JsonResponse<T> = {
    /**
     *
     */
    body: T;
    /**
     *
     */
    cache?: boolean;
    /**
     *
     */
    headers?: HttpResponseHeaders;
    /**
     *
     */
    status: number;
};

/**
 *
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
