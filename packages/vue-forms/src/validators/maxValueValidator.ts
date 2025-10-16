import type { MaybeRefOrGetter } from 'vue';

import { makeRef } from '@nzyme/vue-utils';

import { defineValidator } from '../defineValidator.js';
import type { FormValidationContext, FormValidationResult } from '../types.js';
import * as l from './validators.loc.js';

/**
 * Maximum value validator options
 */
export interface MaxValueValidatorOptions {
    /**
     * Maximum allowed value
     */
    maxValue: MaybeRefOrGetter<bigint | number>;

    /**
     * Whether to check if the value is strictly greater than the maximum value.
     * If true, the value must be less than maxValue (exclusive).
     * If false, the value must be less than or equal to maxValue (inclusive).
     * @default false
     */
    exclusive?: MaybeRefOrGetter<boolean>;

    /**
     * Custom error message function
     */
    message?: (value: bigint | number, ctx: FormValidationContext) => FormValidationResult;
}

/**
 * Maximum value validator that checks if the value is at most the specified maximum
 * @param options - Validator options
 */
export function maxValueValidator(options: MaxValueValidatorOptions) {
    const maxValue = makeRef(options.maxValue);
    const exclusive = makeRef(options.exclusive);

    return defineValidator<bigint | number>({
        async: false,
        validate: (value, ctx) => {
            if (value == null) {
                return;
            }

            const max = maxValue.value;
            const valid = exclusive.value ? value < max : value <= max;
            if (valid) {
                return;
            }

            if (options.message) {
                return options.message(value, ctx);
            }

            return l.maxValueExceeded(ctx.lang, {
                maxValue: max.toString(),
            });
        },
    });
}
