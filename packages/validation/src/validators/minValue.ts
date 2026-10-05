import { translateToString } from '@nzyme/i18n/translateToString.js';

import type { BoundValidatorOptions, Comparable } from '../types.js';
import type { Validator } from '../Validator.js';
import * as l from './validators.loc.js';

/**
 * Creates a validator that checks the value is at least `min`. Skips null/undefined.
 * @util
 */
export function minValue(min: number, options?: BoundValidatorOptions<number>): Validator<number | null | undefined>;
/**
 * Creates a validator that checks the value is at least `min`. Skips null/undefined.
 */
export function minValue(min: bigint, options?: BoundValidatorOptions<bigint>): Validator<bigint | null | undefined>;
/**
 * Creates a validator that checks the value is at least `min`. Skips null/undefined.
 */
export function minValue(
    min: Comparable,
    options?: BoundValidatorOptions<Comparable>,
): Validator<Comparable | null | undefined>;
/**
 * Creates a validator that checks the value is at least `min`. Skips null/undefined.
 * @__NO_SIDE_EFFECTS__
 */
export function minValue<T extends Comparable>(
    min: T,
    options: BoundValidatorOptions<T> = {},
): Validator<T | null | undefined> {
    return (value, ctx) => {
        if (value == null) {
            return undefined;
        }

        const valid = options.exclusive ? value > min : value >= min;
        if (valid) {
            return undefined;
        }

        if (options.message) {
            return options.message(value, ctx);
        }

        return translateToString(l.minValueNotMet, ctx.lang ?? 'en', { minValue: min.toString() });
    };
}
