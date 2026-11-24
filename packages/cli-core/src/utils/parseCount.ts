import { UsageError } from 'clipanion';

/** Params of {@link parseCount}. */
export interface ParseCountParams {
    /** The option's raw value, as the command line gave it. */
    value: string;
    /** The option's name (`--limit`), for the error message. */
    option: string;
    /** The cap; a larger count is lowered to it. Unlimited by default. */
    max?: number;
}

/**
 * A positive integer option (`--limit 20`), capped at `max`; a `UsageError` naming the option otherwise.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function parseCount({ value, option, max = Number.MAX_SAFE_INTEGER }: ParseCountParams): number {
    const count = Number(value);
    if (!(Number.isInteger(count) && count > 0)) {
        throw new UsageError(`${option} must be a positive integer, got ${value}.`);
    }

    return Math.min(count, max);
}
