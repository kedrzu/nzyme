import { joinURL, withQuery } from 'ufo';

import { assertResponse } from './assertResponse.js';
import type { Endpoint } from './defineEndpoint.js';

/**
 * Parameters for a fetch endpoint.
 */
export interface FetchEndpointParams<TParams> {
    /**
     * The parameters for the endpoint.
     */
    params: TParams;
    /**
     * The base URL for the endpoint.
     */
    baseUrl?: string;
    /**
     * Additional headers for the endpoint.
     */
    headers?: Record<string, string>;
}

/**
 *
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
