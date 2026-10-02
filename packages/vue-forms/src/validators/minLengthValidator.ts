import { minLength } from '@nzyme/validation/validators/minLength.js';
import type { WithLength } from '@nzyme/validation/types.js';
import { makeRef } from '@nzyme/vue-utils/reactivity/makeRef.js';
import type { MaybeRefOrGetter } from 'vue';

import { defineValidator } from '../defineValidator.js';
import type { FormValidationContext, FormValidationResult } from '../types.js';
import { fromRule } from './fromRule.js';

/**
 * Min length validator options
 */
export interface MinLengthValidatorOptions<T extends WithLength> {
    /**
     * Minimum length
     */
    minLength: MaybeRefOrGetter<number>;

    /**
     * Custom error message function
     */
    message?: (value: T, ctx: FormValidationContext) => FormValidationResult;

    /**
     * Whether to check if the value is strictly less than the minimum length.
     * @default false
     */
    exclusive?: MaybeRefOrGetter<boolean>;
}

/**
 * Minimum length validator that checks if the value has at least the specified length
 * @param options - Validator options
 */
export function minLengthValidator<T extends WithLength>(options: MinLengthValidatorOptions<T>) {
    const limit = makeRef(options.minLength);
    const exclusive = makeRef(options.exclusive);

    return defineValidator<T>({
        async: false,
        validate: fromRule(
            (value, ctx) => minLength<T>(limit.value, { exclusive: exclusive.value })(value, ctx),
            options,
        ),
    });
}
