import { email } from '@nzyme/validation/validators/email.js';

import { defineValidator } from '../defineValidator.js';
import type { FormValidationContext, FormValidationResult } from '../types.js';
import { fromRule } from './fromRule.js';

/**
 * Email validator options
 */
export interface EmailValidatorOptions {
    /**
     * Custom error message function
     */
    message?: (value: string, ctx: FormValidationContext) => FormValidationResult;
}

/**
 * Email validator that checks if the value is a valid email address
 * @param options - Validator options
 */
export function emailValidator(options: EmailValidatorOptions = {}) {
    return defineValidator<string>({
        async: false,
        validate: fromRule(email(), options),
    });
}
