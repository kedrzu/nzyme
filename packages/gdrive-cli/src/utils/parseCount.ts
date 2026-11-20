import { UsageError } from '@nzyme/cli-core';

/**
 * A positive integer option (`--limit 20`), capped at `max`; a `UsageError` naming the option otherwise.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function parseCount(value: string, option: string, max = Number.MAX_SAFE_INTEGER): number {
    const count = Number(value);
    if (!(Number.isInteger(count) && count > 0)) {
        throw new UsageError(`${option} must be a positive integer, got ${value}.`);
    }

    return Math.min(count, max);
}
