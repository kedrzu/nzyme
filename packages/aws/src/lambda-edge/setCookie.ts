import type { types } from '../lambda/types.js';
import { setHeader } from './setHeader.js';

/**
 * Parameters for setting a cookie.
 */
export interface SetCookieParams {
    /**
     * The name of the cookie.
     */
    name: string;
    /**
     * The value of the cookie.
     */
    value: string;
    /**
     * The maximum age of the cookie in seconds.
     */
    maxAge?: number;
}

/**
 * Sets a cookie on the response.
 */
export function setCookie(response: types.CloudFrontResponse, cookie: SetCookieParams) {
    let cookieString = `${cookie.name}=${cookie.value}; Secure; Path=/;`;
    if (cookie.maxAge) {
        cookieString += ` Max-Age=${cookie.maxAge};`;
    }

    setHeader(response.headers, 'Set-Cookie', cookieString);
}
