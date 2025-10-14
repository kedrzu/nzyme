import type { types } from '../lambda/types.js';
import { setHeader } from './setHeader.js';

/**
 * Sets multiple headers on the response.
 */
export function setHeaders(headers: types.CloudFrontHeaders, headersToSet: Record<string, string>) {
    for (const [key, value] of Object.entries(headersToSet)) {
        setHeader(headers, key, value);
    }
}
