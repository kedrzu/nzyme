import { isEmailValid } from '@nzyme/validation/validators/email.js';

import { defineValidator } from '../defineValidator.js';
import type { FormValidationContext, FormValidationResult } from '../types.js';
import * as l from './validators.loc.js';

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
        validate: (value, ctx) => {
            if (!value?.trim()) {
                return;
            }

            if (isEmailValid(value)) {
                return;
            }

            if (options.message) {
                return options.message(value, ctx);
            }

            return l.invalidEmail(ctx.lang);
        },
    });
}
