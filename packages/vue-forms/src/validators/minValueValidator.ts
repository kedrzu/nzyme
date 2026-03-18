import { makeRef } from '@nzyme/vue-utils/reactivity/makeRef.js';
import type { MaybeRefOrGetter } from 'vue';

import { defineValidator } from '../defineValidator.js';
import type { FormValidationContext, FormValidationResult } from '../types.js';
import * as l from './validators.loc.js';

/**
 * Minimum value validator options
 */
export interface MinValueValidatorOptions {
    /**
     * Minimum required value
     */
    minValue: MaybeRefOrGetter<bigint | number>;

    /**
     * Whether to check if the value is strictly less than the minimum value.
     * If true, the value must be greater than minValue (exclusive).
     * If false, the value must be greater than or equal to minValue (inclusive).
     * @default false
     */
    exclusive?: MaybeRefOrGetter<boolean>;

    /**
     * Custom error message function
     */
    message?: (value: bigint | number, ctx: FormValidationContext) => FormValidationResult;
}

/**
 * Minimum value validator that checks if the value is at least the specified minimum
 * @param options - Validator options
 */
export function minValueValidator(options: MinValueValidatorOptions) {
    const minValue = makeRef(options.minValue);
    const exclusive = makeRef(options.exclusive);

    return defineValidator<bigint | number>({
        async: false,
        validate: (value, ctx) => {
            if (value == null) {
                return;
            }

            const min = minValue.value;
            const valid = exclusive.value ? value > min : value >= min;

            if (valid) {
                return;
            }

            if (options.message) {
                return options.message(value, ctx);
            }

            return l.minValueNotMet(ctx.lang, {
                minValue: min.toString(),
            });
        },
    });
}
