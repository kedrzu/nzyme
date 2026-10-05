import { minDate } from '@nzyme/validation/validators/minDate.js';
import { makeRef } from '@nzyme/vue-utils/reactivity/makeRef.js';
import type { MaybeRefOrGetter } from 'vue';

import { defineValidator } from '../defineValidator.js';
import type { FormValidationContext, FormValidationResult } from '../types.js';
import { fromRule } from './fromRule.js';

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
    const min = makeRef(options.minDate);
    const exclusive = makeRef(options.exclusive);

    return defineValidator<Date>({
        async: false,
        validate: fromRule((value, ctx) => minDate(min.value, { exclusive: exclusive.value })(value, ctx), options),
    });
}
