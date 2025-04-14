import type { HttpResponseHeaders } from '@nzyme/fetch-utils';

/**
 *
 */
export interface HttpResponse {
    /**
     *
     */
    body?: Blob | string;
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
