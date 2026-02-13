import type { HttpResponseHeaders } from '@nzyme/fetch-utils/HttpHeaders.js';

/**
 *
 */
export interface HttpResponse {
    /**
     *
     */
    body?: string | Blob;
    /**
     *
     */
    headers: HttpResponseHeaders;
    /**
     *
     */
    status: number;
    /**
     *
     */
    statusText?: string;
}
