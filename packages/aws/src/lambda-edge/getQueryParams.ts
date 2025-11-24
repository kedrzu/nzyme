import type { types } from '../lambda/types.js';

/**
 * Retrieves a header from the request.
 */
export function getQueryParams(request: types.CloudFrontRequest) {
    const querystring = request.querystring;
    if (!querystring) {
        return null;
    }

    return new URLSearchParams(querystring);
}
