import type { HttpRequestHeaders } from '@nzyme/fetch-utils/HttpHeaders.js';
import type { HttpMethod } from '@nzyme/fetch-utils/HttpMethod.js';

/**
 * Parsed query string parameters from an HTTP request URL.
 */
export interface HttpRequestQuery {
    [key: string]: string | string[] | undefined;
}

/**
 * Represents an incoming HTTP request with parsed components.
 */
export interface HttpRequest {
    /**
     * The path of the request
     */
    path: string;
    /**
     * The query parameters of the request
     */
    query?: HttpRequestQuery;
    /**
     * The HTTP method used for the request
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
