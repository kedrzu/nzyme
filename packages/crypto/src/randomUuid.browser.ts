import type { UUID } from '@nzyme/types/Common.js';

/**
 * Generates a random UUID v4 string.
 *
 * @util
 * @returns A random UUID v4 string.
 * @__NO_SIDE_EFFECTS__
 */
export function randomUuid(): UUID {
    return crypto.randomUUID();
}
