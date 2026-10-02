import { translateToString } from '@nzyme/i18n/translateToString.js';
import { parsePhoneNumberWithError } from 'libphonenumber-js';

import type { ValidatorOptions } from '../types.js';
import type { Validator } from '../Validator.js';
import * as l from './validators.loc.js';

/*
 * Never re-export this module (also not from the package index): it statically imports libphonenumber-js,
 * which is heavy, and frontends load this module lazily through a dynamic import.
 */

/**
 * Creates a validator that checks the value is a valid international phone number with a resolvable country.
 * Skips empty and whitespace-only values.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function phoneNumber(options: ValidatorOptions<string> = {}): Validator<string | null | undefined> {
    return (value, ctx) => {
        const phone = value?.toString();
        if (!phone?.trim()) {
            return undefined;
        }

        if (isPhoneNumberValid(phone)) {
            return undefined;
        }

        if (options.message) {
            return options.message(phone, ctx);
        }

        return translateToString(l.invalidPhoneNumber, ctx.lang ?? 'en');
    };
}

/**
 * Checks whether a string is a valid phone number whose country can be determined.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function isPhoneNumberValid(value: string): boolean {
    try {
        const number = parsePhoneNumberWithError(value);
        return !!number.country && number.isValid();
    } catch {
        return false;
    }
}
