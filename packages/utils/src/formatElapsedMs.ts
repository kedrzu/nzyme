import { formatDurationMs } from './formatDurationMs.js';

/**
 * Formats the elapsed time in milliseconds to a human-readable string.
 */
export function formatElapsedMs(start: number) {
    const ms = performance.now() - start;
    return formatDurationMs(ms);
}
