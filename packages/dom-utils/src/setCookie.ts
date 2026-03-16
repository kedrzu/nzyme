/** Options for setting a browser cookie. */
export interface SetCookieOptions {
    /**
     * The expiration date of the cookie.
     */
    expires?: Date;

    /**
     * The path of the cookie.
     */
    path?: string;

    /**
     * The same site policy of the cookie.
     */
    sameSite?: 'Lax' | 'None' | 'Strict';

    /**
     * The secure flag of the cookie.
     */
    secure?: boolean;
}

/**
 * Stores the language in a cookie.
 *
 * @param language - The language code to store
 */
export function setCookie(name: string, value: string, options: SetCookieOptions = {}): void {
    if (typeof document === 'undefined') {
        return;
    }

    let cookie = `${name}=${value};`;

    if (options.expires) {
        cookie += ` expires=${options.expires.toUTCString()};`;
    }

    if (options.path) {
        cookie += ` path=${options.path};`;
    }

    if (options.sameSite) {
        cookie += ` SameSite=${options.sameSite};`;
    }

    if (options.secure) {
        cookie += ` Secure;`;
    }

    document.cookie = cookie;
}
