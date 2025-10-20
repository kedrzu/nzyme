import { watch } from 'vue';
import type { MaybeRefOrGetter } from 'vue';

import { makeRef } from '@nzyme/vue-utils';

import { defineValidator } from '../defineValidator.js';
import type { FormValidationContext, FormValidationResult } from '../types.js';
import * as l from './validators.loc.js';

/**
 * Required validator options
 */
export interface RequiredValidatorOptions<T> {
    /**
     * Condition to enable the required rule
     * @default true
     */
    condition?: MaybeRefOrGetter<boolean>;

    /**
     * Custom validation logic.
     * Should return true if the value is valid, false otherwise.
     */
    custom?: (value: T | null | undefined) => boolean;

    /**
     * Custom error message function
     */
    message?: (value: unknown, ctx: FormValidationContext) => FormValidationResult;
}

/**
 * Required validator that checks if the value is not empty
 * @param options - Validator options
 */
export function requiredValidator<T>(options: RequiredValidatorOptions<T> = {}) {
    const condition = options.condition ? undefined : makeRef(options.condition);
    const validate = options.custom ?? isFilled;

    return defineValidator<T>({
        async: false,
        validate: (value, ctx) => {
            const required = condition?.value ?? true;
            if (!required) {
                return;
            }

            if (validate(value)) {
                return;
            }

            if (options.message) {
                return options.message(value, ctx);
            }

            return l.required(ctx.lang);
        },
        behavior: ctx => {
            watch(
                () => ctx.value,
                () => {
                    if (ctx.focused) {
                        ctx.show = true;
                    }
                },
            );

            watch(
                () => ctx.focused,
                focusedValue => {
                    if (!focusedValue) {
                        ctx.show = true;
                    }
                },
            );
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
