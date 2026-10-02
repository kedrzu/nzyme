import { makeRef } from '@nzyme/vue-utils/reactivity/makeRef.js';
import type { MaybeRefOrGetter } from 'vue';

import { defineValidator } from '../defineValidator.js';
import type { FormValidationContext, FormValidationResult } from '../types.js';
import { fromRuleAsync } from './fromRule.js';

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
        validate: fromRuleAsync(loadRule, options),
    });

    /**
     * Lazily imports the post code rule — `postal-codes-js` is heavy, so it loads only once there
     * is a value and a resolvable country to validate against.
     * @__NO_SIDE_EFFECTS__
     */
    async function loadRule(value: string | null | undefined) {
        const countryCode = country.value;
        if (!value || !countryCode) {
            return undefined;
        }

        const { postCode } = await import('@nzyme/validation/validators/postCode.js');
        return postCode(countryCode);
    }
}
