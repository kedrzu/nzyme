import { makeRef } from '@nzyme/vue-utils/reactivity/makeRef.js';
import type { MaybeRefOrGetter } from 'vue';

import { defineValidator } from '../defineValidator.js';
import type { FormValidationContext, FormValidationResult } from '../types.js';
import * as l from './validators.loc.js';

/**
 * Minimum date validator options
 */
export interface MinDateValidatorOptions {
    /**
     * Minimum required date
     */
    minDate: MaybeRefOrGetter<Date>;

    /**
     * Whether to check if the value is strictly less than the minimum date.
     * If true, the value must be greater than minDate (exclusive).
     * If false, the value must be greater than or equal to minDate (inclusive).
     * @default false
     */
    exclusive?: MaybeRefOrGetter<boolean>;

    /**
     * Custom error message function
     */
    message?: (value: Date, ctx: FormValidationContext) => FormValidationResult;
}

/**
 * Minimum date validator that checks if the value is at least the specified minimum date
 * @param options - Validator options
 */
export function minDateValidator(options: MinDateValidatorOptions) {
    const minDate = makeRef(options.minDate);
    const exclusive = makeRef(options.exclusive);

    return defineValidator<Date>({
        async: false,
        validate: (value, ctx) => {
            if (value == null) {
                return;
            }

            if (!(value instanceof Date)) {
                return;
            }

            const min = minDate.value;

            const valid = exclusive.value ? value > min : value >= min;

            if (valid) {
                return;
            }

            if (options.message) {
                return options.message(value, ctx);
            }

            return l.minDateNotMet(ctx.lang, {
                minDate: min.toLocaleDateString(),
            });
        },
    });
}
