import type { HttpResponseHeaders } from '@nzyme/fetch-utils';

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
