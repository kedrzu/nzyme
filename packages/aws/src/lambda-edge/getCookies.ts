import type { types } from '../lambda/types.js';
import { getRequestHeader } from './getRequestHeader.js';

/**
 * Retrieves cookies from the request.
 */
export function getCookies(request: types.CloudFrontRequest) {
    const header = getRequestHeader(request, 'cookie');
    const cookies: Record<string, string> = {};

    if (!header) {
        return cookies;
    }

    const cookiesArray = decodeURIComponent(header).split(';');

    for (const cookie of cookiesArray) {
        const [name, value] = cookie.trim().split('=');
        if (name && value) {
            cookies[name] = value;
        }
    }

    return cookies;
}
