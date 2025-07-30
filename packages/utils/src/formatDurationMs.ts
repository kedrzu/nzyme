/**
 * Formats a duration in milliseconds to a human-readable string.
 * Uses milliseconds for durations under 1 second, seconds otherwise.
 * Values are truncated (floored) rather than rounded for exact duration display.
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted duration string
 *
 * @example
 * ```typescript
 * formatDurationMs(500); // "500.0ms"
 * formatDurationMs(1500); // "1.500s"
 * formatDurationMs(90000); // "1m 30s"
 * formatDurationMs(5400000); // "1h 30m"
 * ```
 */
export function formatDurationMs(ms: number) {
    if (ms < 1000) {
        return `${ms.toFixed(1)}ms`;
    }

    let seconds = ms / 1000;
    if (seconds < 60) {
        return `${seconds.toFixed(3)}s`;
    }

    let minutes = Math.floor(seconds / 60);
    seconds = Math.floor(seconds % 60);
    const secondsStr = seconds > 0 ? ` ${seconds}s` : '';
    if (minutes < 60) {
        return `${minutes}m${secondsStr}`;
    }

    const hours = Math.floor(minutes / 60);
    minutes = minutes % 60;
    const minutesStr = minutes > 0 ? ` ${minutes}m` : '';
    return `${hours}h${minutesStr}${secondsStr}`;
}
