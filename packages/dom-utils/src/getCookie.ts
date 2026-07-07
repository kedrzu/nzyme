/**
 * Gets the value of a cookie if available.
 * @util
 *
 * @param name - The name of the cookie
 * @returns The value of the cookie if available, undefined otherwise
 * @__NO_SIDE_EFFECTS__
 */
export function getCookie(name: string): string | undefined {
    if (typeof document === 'undefined') {
        return;
    }

    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
        const [cookieName, value] = cookie.trim().split('=');
        if (cookieName === name && value) {
            return value;
        }
    }
}
