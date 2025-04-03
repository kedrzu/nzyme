import type { CloudFrontResponse } from './types.js';

/**
 * Parameters for the set cookie function.
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
export function setCookie(response: CloudFrontResponse, cookie: SetCookieParams) {
    const cookies = response.cookies || (response.cookies = {});

    const current = cookies[cookie.name];
    let attrs = `Secure; HttpOnly; Path=/;`;

    if (cookie.maxAge) {
        attrs += ` Max-Age=${cookie.maxAge};`;
    }

    if (current) {
        const multivalue = current.multivalue ?? (current.multivalue = []);
        multivalue.push({
            value: cookie.value,
            attributes: attrs,
        });
    } else {
        cookies[cookie.name] = {
            value: cookie.value,
            attributes: attrs,
        };
    }
}
