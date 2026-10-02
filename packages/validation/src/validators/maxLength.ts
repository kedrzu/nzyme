import { translateToString } from '@nzyme/i18n/translateToString.js';

import type { BoundValidatorOptions, WithLength } from '../types.js';
import type { Validator } from '../Validator.js';
import * as l from './validators.loc.js';

/**
 * Creates a validator that checks the value's `length` is at most `limit`.
 * Skips null/undefined.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function maxLength<T extends WithLength>(
    limit: number,
    options: BoundValidatorOptions<T> = {},
): Validator<T | null | undefined> {
    return (value, ctx) => {
        if (value == null) {
            return undefined;
        }

        const valid = options.exclusive ? value.length < limit : value.length <= limit;
        if (valid) {
            return undefined;
        }

        if (options.message) {
            return options.message(value, ctx);
        }

        return translateToString(l.maxLengthExceeded, ctx.lang ?? 'en', { maxLength: limit.toString() });
    };
}
