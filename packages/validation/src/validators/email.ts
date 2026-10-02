import { translateToString } from '@nzyme/i18n/translateToString.js';

import type { ValidatorOptions } from '../types.js';
import type { Validator } from '../Validator.js';
import * as l from './validators.loc.js';

const EMAIL_REGEX =
    /^(([^<>()[\].,;:\s@"]+(\.[^<>()[\].,;:\s@"]+)*)|(".+"))@(([^<>()[\].,;:\s@"]+\.)+[^<>()[\].,;:\s@"]{2,})$/i;

/**
 * Creates a validator that checks the value is a valid email address.
 * Skips empty and whitespace-only values.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function email(options: ValidatorOptions<string> = {}): Validator<string | null | undefined> {
    return (value, ctx) => {
        if (!value?.trim()) {
            return undefined;
        }

        if (isEmailValid(value)) {
            return undefined;
        }

        if (options.message) {
            return options.message(value, ctx);
        }

        return translateToString(l.invalidEmail, ctx.lang ?? 'en');
    };
}

/**
 * Checks whether a string matches a valid email address format.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function isEmailValid(value: string): boolean {
    return EMAIL_REGEX.test(value);
}
