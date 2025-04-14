/**
 * Formats a duration in milliseconds to a human-readable string.
 * Uses milliseconds for durations under 1 second, seconds otherwise.
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted duration string
 *
 * @example
 * ```typescript
 * formatDurationMs(500); // "500.0ms"
 * formatDurationMs(1500); // "1.500s"
 * ```
 */
export function formatDurationMs(ms: number) {
    if (ms < 1000) {
        return `${ms.toFixed(1)}ms`;
    }

    const seconds = ms / 1000;
    return `${seconds.toFixed(3)}s`;
}
