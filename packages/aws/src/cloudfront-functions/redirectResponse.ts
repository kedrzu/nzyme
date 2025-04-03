import { stringifyQuery } from './stringifyQuery.js';
import type { CloudFrontQuery, CloudFrontResponse } from './types.js';

/**
 * Parameters for the redirect response.
 */
export interface RedirectParams {
    /**
     * The URL to redirect to.
     */
    url: string;
    /**
     * The query parameters to append to the redirect URL.
     */
    query?: CloudFrontQuery;
    /**
     * The status code to redirect to.
     */
    status?: number;
}

/**
 * Redirects the response to a new URL.
 */
export function redirectResponse(params: RedirectParams): CloudFrontResponse {
    let url = params.url;
    if (params.query) {
        url += stringifyQuery(params.query);
    }

    return {
        statusCode: params.status || 302,
        statusDescription: params.status === 301 ? 'Moved permanently' : 'Found',
        headers: {
            location: { value: url },
        },
    };
}
