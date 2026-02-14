import type { MaybeRefOrGetter } from 'vue';

import { makeRef } from '@nzyme/vue-utils/reactivity/makeRef.js';

import { defineValidator } from '../defineValidator.js';
import type { FormValidationContext, FormValidationResult } from '../types.js';
import * as l from './validators.loc.js';

/**
 * Post code validator options
 */
export interface PostCodeValidatorOptions {
    /**
     * Country code (e.g., 'US', 'PL')
     */
    country: MaybeRefOrGetter<string | null | undefined>;

    /**
     * Custom error message function
     */
    message?: (value: string, ctx: FormValidationContext) => FormValidationResult;
}

/**
 * Post code validator that checks if the value is a valid postal code for the given country
 * @param options - Validator options
 */
export function postCodeValidator(options: PostCodeValidatorOptions) {
    const country = makeRef(options.country);

    return defineValidator<string>({
        async: true,
        validate: async (value, ctx) => {
            const postcode = value?.toString();
            const countryCode = country.value;

            if (!postcode || !countryCode) {
                return;
            }

            const isValid = await validatePostCode(postcode, countryCode);
            if (isValid) {
                return;
            }

            if (options.message) {
                return options.message(postcode, ctx);
            }
            return l.invalidPostCode(ctx.lang);
        },
    });
}

/**
 * Validates if the value is a valid postal code for the given country
 * @param value - The postal code to validate
 * @param country - The country code
 * @returns Promise that resolves to true if valid, false otherwise
 */
async function validatePostCode(value: string, country: string) {
    const { validate } = await import('postal-codes-js');
    const result = validate(country, value);

    return result === true;
}
