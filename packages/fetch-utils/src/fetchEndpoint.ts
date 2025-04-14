import { joinURL, withQuery } from 'ufo';

import { assertResponse } from './assertResponse.js';
import type { Endpoint } from './defineEndpoint.js';

/**
 * Parameters for configuring a fetch endpoint request.
 * Includes endpoint parameters, base URL, and additional headers.
 */
export interface FetchEndpointParams<TParams> {
    /**
     * The parameters for the endpoint request
     */
    params: TParams;
    /**
     * Optional base URL to prepend to the endpoint URL
     */
    baseUrl?: string;
    /**
     * Optional additional headers to include in the request
     */
    headers?: Record<string, string>;
}

/**
 * Executes a fetch request for a configured endpoint.
 * Handles URL joining, header merging, and response processing.
 *
 * @param endpoint - The endpoint configuration to execute
 * @param params - Parameters for the endpoint request
 * @returns A promise that resolves to the processed response
 */
export async function fetchEndpoint<TParams, TResult>(
    endpoint: Endpoint<TParams, TResult>,
    params: FetchEndpointParams<TParams>,
): Promise<TResult> {
    let request = endpoint.request(params.params);

    request = {
        ...request,
        url: params.baseUrl ? joinURL(params.baseUrl, request.url) : request.url,
        headers: {
            ...params.headers,
            ...request.headers,
        },
    };

    const url = request.query ? withQuery(request.url, request.query) : request.url;
    // Clone the response to avoid "Other side closed error"
    const response = (await fetch(url, request)).clone();

    if (endpoint.response) {
        return await endpoint.response(response, params.params);
    } else {
        await assertResponse(response);
    }

    return undefined as unknown as TResult;
}
