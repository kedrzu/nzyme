import { translateToString } from '@nzyme/i18n/translateToString.js';

import type { ValidatorOptions } from '../types.js';
import type { Validator } from '../Validator.js';
import * as l from './validators.loc.js';

/**
 * Creates a validator that checks the value matches `pattern`.
 * Skips empty values.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function regex(pattern: RegExp, options: ValidatorOptions<string> = {}): Validator<string | null | undefined> {
    return (value, ctx) => {
        if (!value) {
            return undefined;
        }

        if (pattern.test(value)) {
            return undefined;
        }

        if (options.message) {
            return options.message(value, ctx);
        }

        return translateToString(l.invalidFormat, ctx.lang ?? 'en');
    };
}
