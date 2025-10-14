import { url } from 'inspector';

/**
 * Checks if the Node.js process is running in debug mode
 *
 * @returns Boolean indicating whether the debugger is attached
 */
export function isDebugging() {
    return url() !== undefined;
}
