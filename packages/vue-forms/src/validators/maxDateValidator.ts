import { maxDate } from '@nzyme/validation/validators/maxDate.js';
import { makeRef } from '@nzyme/vue-utils/reactivity/makeRef.js';
import type { MaybeRefOrGetter } from 'vue';

import { defineValidator } from '../defineValidator.js';
import type { FormValidationContext, FormValidationResult } from '../types.js';
import { fromRule } from './fromRule.js';

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
    const max = makeRef(options.maxDate);
    const exclusive = makeRef(options.exclusive);

    return defineValidator<Date>({
        async: false,
        validate: fromRule((value, ctx) => maxDate(max.value, { exclusive: exclusive.value })(value, ctx), options),
    });
}
