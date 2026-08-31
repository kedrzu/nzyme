import { defineValidator } from '../defineValidator.js';
import type { FormValidationContext, FormValidationResult } from '../types.js';
import * as l from './validators.loc.js';

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
        validate: async (value, ctx) => {
            const phone = value?.toString();
            if (!phone?.trim()) {
                return undefined;
            }

            const isValid = await validatePhoneNumber(phone);
            if (isValid) {
                return undefined;
            }

            if (options.message) {
                return options.message(phone, ctx);
            }

            return l.invalidPhoneNumber(ctx.lang);
        },
    });
}

/**
 * Validates if the value is a valid phone number
 * @param value - The value to validate
 * @returns Promise that resolves to true if valid, false otherwise
 * @__NO_SIDE_EFFECTS__
 */
async function validatePhoneNumber(value: string) {
    const { parsePhoneNumberWithError } = await import('libphonenumber-js');

    try {
        const number = parsePhoneNumberWithError(value);
        return !!number.country && number.isValid();
    } catch {
        return false;
    }
}
