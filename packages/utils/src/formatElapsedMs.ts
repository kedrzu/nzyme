import { formatDurationMs } from './formatDurationMs.js';

/**
 * Formats the elapsed time in milliseconds to a human-readable string.
 * Uses performance.now() to calculate the elapsed time from the start timestamp.
 * @util
 *
 * @param start - The start timestamp in milliseconds (from performance.now())
 * @returns A human-readable string representing the elapsed time
 *
 * @example
 * ```typescript
 * const start = performance.now();
 *
 * // Do some work...
 * await someAsyncOperation();
 *
 * console.log(`Operation took ${formatElapsedMs(start)}`);
 * // Example output: "Operation took 1.234s"
 * ```
 */
export function formatElapsedMs(start: number) {
    const ms = performance.now() - start;
    return formatDurationMs(ms);
}
