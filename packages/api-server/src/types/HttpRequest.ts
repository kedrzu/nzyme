import type { QueryObject } from 'ufo';

import type { HttpMethod, HttpRequestHeaders } from '@nzyme/fetch-utils';

/**
 *
 */
export interface HttpRequest {
    /**
     *
     */
    path: string;
    /**
     *
     */
    query?: QueryObject;
    /**
     *
     */
    method: HttpMethod;
    /**
     *
     */
    body?: string;
    /**
     *
     */
    headers: HttpRequestHeaders;
}
