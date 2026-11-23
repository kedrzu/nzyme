import { UsageError } from '@nzyme/cli-core';
import { parseCount } from '@nzyme/cli-core/utils/parseCount.js';

/** Params of {@link parseSpotifyLimit}. */
export interface ParseSpotifyLimitParams {
    /** The option's raw value. */
    value: string;
    /** The endpoint's cap: 50, search and artist albums 10. */
    max: number;
}

/**
 * The `--limit` of a list, from 1 up to the endpoint's cap. A larger one is refused, not lowered:
 * Spotify rejects it, and a silently shorter list would hide that the request was wrong.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function parseSpotifyLimit({ value, max }: ParseSpotifyLimitParams): number {
    const limit = parseCount({ value, option: '--limit' });
    if (limit > max) {
        throw new UsageError(`--limit must be at most ${max} here, got ${value}.`);
    }

    return limit;
}
