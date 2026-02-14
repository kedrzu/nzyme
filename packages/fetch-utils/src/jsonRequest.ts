import type { OmitProps } from '@nzyme/types/Object.js';

import type { FetchRequest } from './fetchRequest.js';

/**
 * Request configuration for JSON requests.
 * Extends the base FetchRequest but allows for a typed body parameter.
 */
export interface EndpointJsonRequest<T = unknown> extends OmitProps<FetchRequest, 'body'> {
    /** The request body that will be serialized as JSON */
    body?: T;
}

/**
 * Creates a fetch request with JSON body.
 * Automatically sets the appropriate Content-Type header and serializes the body as JSON.
 *
 * @param request - The request configuration with JSON data
 * @returns A FetchRequest configured for JSON submission
 */
export function jsonRequest<T>(request: EndpointJsonRequest<T>): FetchRequest {
    if (!request.body) {
        return request as FetchRequest;
    }

    return {
        ...request,
        headers: {
            ...request.headers,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(request.body),
    };
}
