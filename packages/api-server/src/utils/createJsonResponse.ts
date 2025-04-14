import { getMd5Hash } from '@nzyme/crypto-utils';
import type { HttpResponseHeaders } from '@nzyme/fetch-utils';
import { toJson } from '@nzyme/zchema';

import { CACHE_CONTROL_DISABLED } from './cacheControl.js';
import type { HttpResponse } from '../types/HttpResponse.js';

/**
 *
 */
export type JsonResponse = {
    /**
     *
     */
    status: number;
    /**
     *
     */
    body: unknown;
    /**
     *
     */
    headers?: HttpResponseHeaders;
    /**
     *
     */
    cache?: boolean;
};

/**
 *
 */
export function createJsonResponse(response: JsonResponse): HttpResponse {
    const body = toJson(response.body);

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
