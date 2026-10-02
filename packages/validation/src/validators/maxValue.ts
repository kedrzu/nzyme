import { translateToString } from '@nzyme/i18n/translateToString.js';

import type { BoundValidatorOptions, Comparable } from '../types.js';
import type { Validator } from '../Validator.js';
import * as l from './validators.loc.js';

/**
 * Creates a validator that checks the value is at most `max`. Skips null/undefined.
 * @util
 */
export function maxValue(max: number, options?: BoundValidatorOptions<number>): Validator<number | null | undefined>;
/**
 * Creates a validator that checks the value is at most `max`. Skips null/undefined.
 */
export function maxValue(max: bigint, options?: BoundValidatorOptions<bigint>): Validator<bigint | null | undefined>;
/**
 * Creates a validator that checks the value is at most `max`. Skips null/undefined.
 */
export function maxValue(
    max: Comparable,
    options?: BoundValidatorOptions<Comparable>,
): Validator<Comparable | null | undefined>;
/**
 * Creates a validator that checks the value is at most `max`. Skips null/undefined.
 * @__NO_SIDE_EFFECTS__
 */
export function maxValue<T extends Comparable>(
    max: T,
    options: BoundValidatorOptions<T> = {},
): Validator<T | null | undefined> {
    return (value, ctx) => {
        if (value == null) {
            return undefined;
        }

        const valid = options.exclusive ? value < max : value <= max;
        if (valid) {
            return undefined;
        }

        if (options.message) {
            return options.message(value, ctx);
        }

        return translateToString(l.maxValueExceeded, ctx.lang ?? 'en', { maxValue: max.toString() });
    };
}
