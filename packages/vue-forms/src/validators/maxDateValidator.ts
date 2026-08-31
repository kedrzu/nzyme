import { makeRef } from '@nzyme/vue-utils/reactivity/makeRef.js';
import type { MaybeRefOrGetter } from 'vue';

import { defineValidator } from '../defineValidator.js';
import type { FormValidationContext, FormValidationResult } from '../types.js';
import * as l from './validators.loc.js';

/**
 * Maximum date validator options
 */
export interface MaxDateValidatorOptions {
    /**
     * Maximum allowed date
     */
    maxDate: MaybeRefOrGetter<Date>;

    /**
     * Whether to check if the value is strictly greater than the maximum date.
     * If true, the value must be less than maxDate (exclusive).
     * If false, the value must be less than or equal to maxDate (inclusive).
     * @default false
     */
    exclusive?: MaybeRefOrGetter<boolean>;

    /**
     * Custom error message function
     */
    message?: (value: Date, ctx: FormValidationContext) => FormValidationResult;
}

/**
 * Maximum date validator that checks if the value is at most the specified maximum date
 * @param options - Validator options
 */
export function maxDateValidator(options: MaxDateValidatorOptions) {
    const maxDate = makeRef(options.maxDate);
    const exclusive = makeRef(options.exclusive);

    return defineValidator<Date>({
        async: false,
        validate: (value, ctx) => {
            if (!(value instanceof Date)) {
                return undefined;
            }

            const max = maxDate.value;

            const valid = exclusive.value ? value < max : value <= max;

            if (valid) {
                return undefined;
            }

            if (options.message) {
                return options.message(value, ctx);
            }

            return l.maxDateExceeded(ctx.lang, {
                maxDate: max.toLocaleDateString(),
            });
        },
    });
}
