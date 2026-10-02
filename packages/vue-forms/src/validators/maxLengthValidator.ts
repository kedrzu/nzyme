import { maxLength } from '@nzyme/validation/validators/maxLength.js';
import type { WithLength } from '@nzyme/validation/types.js';
import { makeRef } from '@nzyme/vue-utils/reactivity/makeRef.js';
import type { MaybeRefOrGetter } from 'vue';

import { defineValidator } from '../defineValidator.js';
import type { FormValidationContext, FormValidationResult } from '../types.js';
import { fromRule } from './fromRule.js';

/**
 * Max length validator options
 */
export interface MaxLengthValidatorOptions<T extends WithLength> {
    /**
     * Maximum length
     */
    maxLength: MaybeRefOrGetter<number>;

    /**
     * Custom error message function
     */
    message?: (value: T, ctx: FormValidationContext) => FormValidationResult;

    /**
     * Whether to check if the value is strictly greater than the maximum length.
     * If true, the value must be less than maxLength (exclusive).
     * If false, the value must be less than or equal to maxLength (inclusive).
     * @default false
     */
    exclusive?: MaybeRefOrGetter<boolean>;
}

/**
 * Maximum length validator that checks if the value has at most the specified length
 * @param options - Validator options
 */
export function maxLengthValidator<T extends WithLength>(options: MaxLengthValidatorOptions<T>) {
    const limit = makeRef(options.maxLength);
    const exclusive = makeRef(options.exclusive);

    return defineValidator<T>({
        async: false,
        validate: fromRule(
            (value, ctx) => maxLength<T>(limit.value, { exclusive: exclusive.value })(value, ctx),
            options,
        ),
    });
}
