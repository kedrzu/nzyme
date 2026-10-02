import { translateToString } from '@nzyme/i18n/translateToString.js';

import type { BoundValidatorOptions } from '../types.js';
import type { Validator } from '../Validator.js';
import * as l from './validators.loc.js';

/**
 * Creates a validator that checks the date is not later than `max`.
 * Skips anything that is not a `Date` (including null/undefined).
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function maxDate(max: Date, options: BoundValidatorOptions<Date> = {}): Validator<Date | null | undefined> {
    return (value, ctx) => {
        if (!(value instanceof Date)) {
            return undefined;
        }

        const valid = options.exclusive ? value < max : value <= max;
        if (valid) {
            return undefined;
        }

        if (options.message) {
            return options.message(value, ctx);
        }

        return translateToString(l.maxDateExceeded, ctx.lang ?? 'en', { maxDate: max.toLocaleDateString() });
    };
}
