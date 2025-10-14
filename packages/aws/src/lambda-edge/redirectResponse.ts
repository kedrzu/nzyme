import type { types } from '../lambda/types.js';

/**
 * Parameters for the redirect response.
 */
export interface RedirectParams {
    /**
     * The URL to redirect to.
     */
    uri: string;
    /**
     * The query parameters to append to the redirect URL.
     */
    query?: string;
    /**
     * The status code to redirect to.
     */
    status?: number;
}

/**
 * Redirects the response to a new URL.
 */
export function redirectResponse(params: RedirectParams): types.CloudFrontResponse {
    return {
        status: params.status?.toString() || '302',
        statusDescription: params.status === 301 ? 'Moved Permanently' : 'Found',
        headers: {
            location: [{ value: params.query ? `${params.uri}?${params.query}` : params.uri }],
        },
    };
}
