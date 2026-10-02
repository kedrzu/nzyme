import { maxValue } from '@nzyme/validation/validators/maxValue.js';
import type { Comparable } from '@nzyme/types/Common.js';
import { makeRef } from '@nzyme/vue-utils/reactivity/makeRef.js';
import type { MaybeRefOrGetter } from 'vue';

import { defineValidator } from '../defineValidator.js';
import type { FormValidationContext, FormValidationResult } from '../types.js';
import { fromRule } from './fromRule.js';

/**
 * Maximum value validator options
 */
export interface MaxValueValidatorOptions {
    /**
     * Maximum allowed value
     */
    maxValue: MaybeRefOrGetter<Comparable>;

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
    message?: (value: Comparable, ctx: FormValidationContext) => FormValidationResult;
}

/**
 * Maximum value validator that checks if the value is at most the specified maximum
 * @param options - Validator options
 */
export function maxValueValidator(options: MaxValueValidatorOptions) {
    const max = makeRef(options.maxValue);
    const exclusive = makeRef(options.exclusive);

    return defineValidator<Comparable>({
        async: false,
        validate: fromRule((value, ctx) => maxValue(max.value, { exclusive: exclusive.value })(value, ctx), options),
    });
}
