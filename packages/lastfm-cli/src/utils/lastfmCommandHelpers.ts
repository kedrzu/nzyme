/**
 * The pieces the Last.fm commands share: the `--limit` option, the resolved-name note and the
 * duration column.
 */
import type { Writable } from 'node:stream';

import { Option } from '@nzyme/cli-core';
import { parseCount } from '@nzyme/cli-core/utils/parseCount.js';

/** The most items Last.fm returns on one page. */
const MAX_LIMIT = 200;

/**
 * The `--limit` option of a list command, 20 by default; read it with {@link parseLastfmLimit}.
 * @__NO_SIDE_EFFECTS__
 */
export function lastfmLimitOption() {
    return Option.String('--limit', '20', { description: `The most items to list, at most ${MAX_LIMIT}` });
}

/**
 * The `--limit` value as a count; a `UsageError` when it is not a positive integer. Capped at 200.
 * @__NO_SIDE_EFFECTS__
 */
export function parseLastfmLimit(value: string): number {
    return parseCount({ value, option: '--limit', max: MAX_LIMIT });
}

/**
 * Writes `# <resolved>` to stderr when Last.fm autocorrected the name it was given, so stdout stays
 * pure data while the reader still sees which artist the list is about.
 */
export function writeResolvedName(stderr: Writable, input: string, resolved: string | null) {
    if (resolved && resolved.toLowerCase() !== input.toLowerCase()) {
        stderr.write(`# ${resolved}\n`);
    }
}

/**
 * A duration in seconds as `m:ss`; `''` when unknown.
 * @__NO_SIDE_EFFECTS__
 */
export function formatLastfmDuration(seconds: number | null): string {
    if (seconds == null) {
        return '';
    }

    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
