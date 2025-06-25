import type { types } from '../lambda/types.js';

/**
 * Sets a header on the response.
 */
export function setHeader(headers: types.CloudFrontHeaders, key: string, value: string) {
    let header = headers[key];
    if (header == null) {
        header = [];
        headers[key] = header;
    }

    header.push({ key, value });
}
