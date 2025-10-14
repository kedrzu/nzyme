import type { types } from '../lambda/types.js';

/**
 * Retrieves a header from the request.
 */
export function getRequestHeader(request: types.CloudFrontRequest, name: string) {
    const header = request.headers[name];
    return header && header[0] && header[0].value;
}
