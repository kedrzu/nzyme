import { UsageError } from '@nzyme/cli-core';

/**
 * The `--offset` of a list: a whole number, 0 or more.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function parseSpotifyOffset(value: string): number {
    const offset = Number(value);
    if (!(Number.isInteger(offset) && offset >= 0)) {
        throw new UsageError(`--offset must be 0 or a positive integer, got ${value}.`);
    }

    return offset;
}
