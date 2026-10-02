import { translateToString } from '@nzyme/i18n/translateToString.js';

import type { BoundValidatorOptions } from '../types.js';
import type { Validator } from '../Validator.js';
import * as l from './validators.loc.js';

/**
 * Creates a validator that checks the date is not earlier than `min`.
 * Skips anything that is not a `Date` (including null/undefined).
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function minDate(min: Date, options: BoundValidatorOptions<Date> = {}): Validator<Date | null | undefined> {
    return (value, ctx) => {
        if (!(value instanceof Date)) {
            return undefined;
        }

        const valid = options.exclusive ? value > min : value >= min;
        if (valid) {
            return undefined;
        }

        if (options.message) {
            return options.message(value, ctx);
        }

        return translateToString(l.minDateNotMet, ctx.lang ?? 'en', { minDate: min.toLocaleDateString() });
    };
}
