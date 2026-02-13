import type { OmitProps } from '@nzyme/types/Object.js';

import type { FetchRequest } from './fetchRequest.js';

/**
 * Request configuration for form URL encoded requests.
 * Extends the base FetchRequest but allows for a typed body parameter.
 */
export interface EndpointFormUrlEncodedRequest<T = unknown> extends OmitProps<FetchRequest, 'body'> {
    /** The request body that will be encoded as form URL parameters */
    body?: T;
}

/**
 * Creates a fetch request with form URL encoded body.
 * Automatically sets the appropriate Content-Type header and converts the body to URLSearchParams.
 *
 * @param request - The request configuration with form data
 * @returns A FetchRequest configured for form URL encoded submission
 */
export function formUrlEncodedRequest<T>(request: EndpointFormUrlEncodedRequest<T>): FetchRequest {
    if (!request.body) {
        return request as FetchRequest;
    }

    return {
        url: request.url,
        method: request.method,
        query: request.query,
        headers: {
            ...request.headers,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(request.body),
    };
}
