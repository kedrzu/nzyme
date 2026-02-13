import type { MaybeRefOrGetter } from 'vue';

import { makeRef } from '@nzyme/vue-utils/reactivity/makeRef.js';

import { defineValidator } from '../defineValidator.js';
import type { FormValidationContext, FormValidationResult } from '../types.js';
import * as l from './validators.loc.js';

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

interface WithLength {
    length: number;
}

/**
 * Maximum length validator that checks if the value has at most the specified length
 * @param options - Validator options
 */
export function maxLengthValidator<T extends WithLength>(options: MaxLengthValidatorOptions<T>) {
    const maxLength = makeRef(options.maxLength);
    const exclusive = makeRef(options.exclusive);

    return defineValidator<T>({
        async: false,
        validate: (value, ctx) => {
            if (value == null) {
                return;
            }

            const valid = exclusive.value ? value.length < maxLength.value : value.length <= maxLength.value;
            if (valid) {
                return;
            }

            if (options.message) {
                return options.message(value, ctx);
            }

            return l.maxLengthExceeded(ctx.lang, {
                maxLength: maxLength.value.toString(),
            });
        },
    });
}
