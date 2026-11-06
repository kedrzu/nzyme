import { GiB, MiB } from './byteUnits.js';

/**
 * Formats a byte count for a human message: GiB with one decimal from 1 GiB up, whole MiB below.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function formatBytes(bytes: number): string {
    if (Math.abs(bytes) >= GiB) {
        return `${(bytes / GiB).toFixed(1)} GiB`;
    }

    return `${Math.round(bytes / MiB)} MiB`;
}
