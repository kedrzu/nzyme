import { defineValidator } from '../defineValidator.js';
import type { FormValidationContext, FormValidationResult } from '../types.js';
import { fromRuleAsync } from './fromRule.js';

/**
 * Phone number validator options
 */
export interface PhoneNumberValidatorOptions {
    /**
     * Custom error message function
     */
    message?: (value: string, ctx: FormValidationContext) => FormValidationResult;
}

/**
 * Phone number validator that checks if the value is a valid phone number
 * @param options - Validator options
 */
export function phoneNumberValidator(options: PhoneNumberValidatorOptions = {}) {
    return defineValidator<string>({
        async: true,
        validate: fromRuleAsync(loadRule, options),
    });
}

/**
 * Lazily imports the phone number rule — `libphonenumber-js` is heavy, so it loads only once
 * there is a non-blank value to validate.
 * @__NO_SIDE_EFFECTS__
 */
async function loadRule(value: string | null | undefined) {
    if (!value?.trim()) {
        return undefined;
    }

    const { phoneNumber } = await import('@nzyme/validation/validators/phoneNumber.js');
    return phoneNumber();
}
