import { getMd5Hash } from '@nzyme/crypto-utils';
import type { HttpResponseHeaders } from '@nzyme/fetch-utils';

import type { Serializer } from '../Serializer.js';
import type { HttpResponse } from '../types/HttpResponse.js';
import { CACHE_CONTROL_DISABLED } from './cacheControl.js';

/**
 *
 */
export type JsonResponse = {
    /**
     *
     */
    body: unknown;
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
    serializer: Serializer;
    /**
     *
     */
    status: number;
};

/**
 *
 */
export function createJsonResponse(response: JsonResponse): HttpResponse {
    const body = response.serializer.serialize(response.body);

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
