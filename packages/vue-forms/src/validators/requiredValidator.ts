import type { MaybeRefOrGetter } from 'vue';

import { makeRef } from '@nzyme/vue-utils';

import { defineValidator } from '../defineValidator.js';
import type { FormValidationContext, FormValidationResult } from '../types.js';
import * as l from './validators.loc.js';

/**
 * Required validator options
 */
export interface RequiredValidatorOptions {
    /**
     * Condition to enable the required rule
     * @default true
     */
    condition?: MaybeRefOrGetter<boolean>;

    /**
     * Whether to use `condition` as an only validation condition.
     * @default false
     */
    custom?: boolean;

    /**
     * Custom error message function
     */
    message?: (value: unknown, ctx: FormValidationContext) => FormValidationResult;
}

/**
 * Required validator that checks if the value is not empty
 * @param options - Validator options
 */
export function requiredValidator(options: RequiredValidatorOptions = {}) {
    const condition = options.custom ? undefined : makeRef(options.condition);

    return defineValidator<unknown>({
        async: false,
        validate: (value, ctx) => {
            const isRequired = condition?.value ?? true;
            if (!isRequired) {
                return;
            }

            if (options.custom || isFilled(value)) {
                return;
            }

            if (options.message) {
                return options.message(value, ctx);
            }

            return l.required(ctx.lang);
        },
    });
}

/**
 * Checks if a value is filled (not empty)
 * @param value - The value to check
 * @returns True if value is filled, false otherwise
 * @__NO_SIDE_EFFECTS__
 */
function isFilled(value: unknown) {
    if (value == null || value === false) {
        return false;
    }

    if (typeof value === 'string' && value.trim() === '') {
        return false;
    }

    if (Array.isArray(value) && value.length === 0) {
        return false;
    }

    return true;
}
