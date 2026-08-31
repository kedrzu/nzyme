import { url } from 'node:inspector';

/**
 * Checks if the Node.js process is running in debug mode
 *
 * @util
 * @returns Boolean indicating whether the debugger is attached
 */
export function isDebugging() {
    return url() !== undefined;
}
