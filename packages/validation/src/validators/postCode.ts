import { translateToString } from '@nzyme/i18n/translateToString.js';
import { validate } from 'postal-codes-js';

import type { ValidatorOptions } from '../types.js';
import type { Validator } from '../Validator.js';
import * as l from './validators.loc.js';

/*
 * Never re-export this module (also not from the package index): it statically imports postal-codes-js,
 * which is heavy, and frontends load this module lazily through a dynamic import.
 */

/**
 * Creates a validator that checks the value is a valid postal code for `country`.
 * Skips empty values, and skips entirely while the country is unknown.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function postCode(
    country: string | null | undefined,
    options: ValidatorOptions<string> = {},
): Validator<string | null | undefined> {
    return (value, ctx) => {
        const code = value?.toString();
        if (!code || !country) {
            return undefined;
        }

        if (isPostCodeValid(code, country)) {
            return undefined;
        }

        if (options.message) {
            return options.message(code, ctx);
        }

        return translateToString(l.invalidPostCode, ctx.lang ?? 'en');
    };
}

/**
 * Checks whether a string is a valid postal code for the given ISO 3166-1 country code.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function isPostCodeValid(value: string, country: string): boolean {
    return validate(country, value) === true;
}
