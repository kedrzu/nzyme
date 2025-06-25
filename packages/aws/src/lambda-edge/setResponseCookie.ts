import type { types } from '../lambda/types.js';

/**
 * Sets a cookie on the response.
 */
export function setResponseCookie(response: types.CloudFrontResponse, cookie: string) {
    const headers = response.headers;
    const cookies = headers['set-cookie'] || (headers['set-cookie'] = []);

    cookies.push({
        key: 'set-cookie',
        value: cookie,
    });
}
