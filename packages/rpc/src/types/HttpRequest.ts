import type { HttpRequestHeaders } from '@nzyme/fetch-utils/HttpHeaders.js';
import type { HttpMethod } from '@nzyme/fetch-utils/HttpMethod.js';

/**
 *
 */
export interface HttpRequestQuery {
    [key: string]: string | string[] | undefined;
}

/**
 *
 */
export interface HttpRequest {
    /**
     * The path of the request
     */
    path: string;
    /**
     * The path of the request
     */
    query?: HttpRequestQuery;
    /**
     * The query parameters of the request
     */
    method: HttpMethod;
    /**
     * The body of the request
     */
    body?: string;
    /**
     * The headers of the request
     */
    headers: HttpRequestHeaders;
    /**
     * The IP address of the request
     */
    ip: string;
}
