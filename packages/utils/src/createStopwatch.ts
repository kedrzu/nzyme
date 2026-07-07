/**
 * Creates a stopwatch to measure elapsed time.
 * Uses high-resolution timing via performance.now().
 * @util
 *
 * @returns An object with methods to measure and format elapsed time
 *
 * @example
 * ```typescript
 * const stopwatch = createStopwatch();
 *
 * // Do some work...
 * await someAsyncOperation();
 *
 * console.log(`Operation took ${stopwatch.format()}`);
 * // Example output: "Operation took 1.234s"
 * ```
 */
export function createStopwatch() {
    const start = performance.now();
    const duration = () => performance.now() - start;
    const format = () => formatDuration(duration());

    return {
        start,
        duration,
        format,
    };
}

/**
 * Formats a duration in milliseconds into a human-readable string.
 * Uses milliseconds for durations under 1 second, seconds otherwise.
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted duration string
 * @private
 */
function formatDuration(ms: number) {
    if (ms < 1000) {
        return `${ms.toFixed(1)}ms`;
    }

    const seconds = ms / 1000;
    return `${seconds.toFixed(3)}s`;
}
