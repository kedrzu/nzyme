import type { HttpResponseHeaders } from '@nzyme/fetch-utils/HttpHeaders.js';

/**
 * Represents an outgoing HTTP response returned by the router.
 */
export interface HttpResponse {
    /** The response body, either a JSON string or binary blob */
    body?: string | Blob;
    /** Response headers to send back to the client */
    headers: HttpResponseHeaders;
    /** HTTP status code */
    status: number;
    /** Optional HTTP status text */
    statusText?: string;
}
