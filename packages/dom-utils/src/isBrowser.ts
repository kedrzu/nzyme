/**
 * Determines if the code is running in a browser environment.
 * Useful for writing code that works in both server-side and client-side contexts,
 * particularly for isomorphic/universal applications with SSR/CSR.
 * @util
 *
 * @returns True if running in a browser context, false otherwise (e.g., Node.js)
 */
export function isBrowser() {
    return typeof window === 'object';
}
