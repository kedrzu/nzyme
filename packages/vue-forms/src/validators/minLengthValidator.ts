import { makeRef } from '@nzyme/vue-utils/reactivity/makeRef.js';
import type { MaybeRefOrGetter } from 'vue';

import { defineValidator } from '../defineValidator.js';
import type { FormValidationContext, FormValidationResult } from '../types.js';
import * as l from './validators.loc.js';

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

interface WithLength {
    length: number;
}

/**
 * Minimum length validator that checks if the value has at least the specified length
 * @param options - Validator options
 */
export function minLengthValidator<T extends WithLength>(options: MinLengthValidatorOptions<T>) {
    const minLength = makeRef(options.minLength);
    const exclusive = makeRef(options.exclusive);

    return defineValidator<T>({
        async: false,
        validate: (value, ctx) => {
            if (value == null) {
                return undefined;
            }

            const valid = exclusive.value ? value.length > minLength.value : value.length >= minLength.value;

            if (valid) {
                return undefined;
            }

            if (options.message) {
                return options.message(value, ctx);
            }

            return l.minLengthNotMet(ctx.lang, {
                minLength: minLength.value.toString(),
            });
        },
    });
}
