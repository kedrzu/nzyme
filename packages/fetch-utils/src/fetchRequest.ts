import type { QueryObject } from 'ufo';
import { withQuery } from 'ufo';

import { assertResponse } from './assertResponse.js';
import type { HttpMethod } from './HttpMethod.js';

/**
 * Extended fetch request configuration that includes URL, query parameters, and standard RequestInit options.
 */
export interface FetchRequest extends RequestInit {
    /**
     * The target URL for the request
     */
    url: string;
    /**
     * Optional query parameters to append to the URL
     */
    query?: QueryObject;
    /**
     * HTTP method for the request
     */
    method?: HttpMethod;
    /**
     * Request headers as key-value pairs
     */
    headers?: Record<string, string>;
}

/**
 * Executes a fetch request with the provided configuration.
 * Automatically handles query parameter serialization and response validation.
 *
 * @param request - The request configuration
 * @returns A cloned Response object after validation
 */
export async function fetchRequest(request: FetchRequest): Promise<Response> {
    const url = request.query ? withQuery(request.url, request.query) : request.url;
    const response = (await fetch(url, request));

    await assertResponse(response);
    // Clone the response to avoid "Other side closed error"
    return response.clone() as Response;
}
