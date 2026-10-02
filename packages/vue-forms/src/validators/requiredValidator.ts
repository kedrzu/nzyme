import { required } from '@nzyme/validation/validators/required.js';
import { makeRef } from '@nzyme/vue-utils/reactivity/makeRef.js';
import type { MaybeRefOrGetter } from 'vue';

import { requiredBehavior } from '../behaviors/requiredBehavior.js';
import { defineValidator } from '../defineValidator.js';
import type { FormValidationContext, FormValidationResult } from '../types.js';
import { toFormValidationResult } from './fromRule.js';

/**
 * Required validator options
 */
export interface RequiredValidatorOptions<T> {
    /**
     * Condition to enable the required rule
     * @default true
     */
    condition?: MaybeRefOrGetter<boolean>;

    /**
     * Whether to validate the value lazily.
     * If true, the value will be validated only when submitting the form.
     * @default false
     */
    lazy?: boolean;

    /**
     * Custom validation logic.
     * Should return true if the value is valid, false otherwise.
     */
    custom?: (value: T | null | undefined, ctx: FormValidationContext) => boolean;

    /**
     * Custom error message function
     */
    message?: (value: unknown, ctx: FormValidationContext) => FormValidationResult;
}

/**
 * Required validator that checks if the value is not empty
 * @param options - Validator options
 */
export function requiredValidator<T>(options: RequiredValidatorOptions<T> = {}) {
    const condition = options.condition ? makeRef(options.condition) : undefined;
    const lazy = options.lazy ?? false;
    const custom = options.custom;

    return defineValidator<T>({
        async: false,
        validate: (value, ctx) => {
            const isRequired = condition?.value ?? true;
            if (!isRequired) {
                return undefined;
            }

            // `required`'s `test` is called under a bare `ValidationContext`. Closing over the
            // real `ctx` here — instead of forwarding the one `required` would pass to `test` —
            // keeps `custom` on its public `FormValidationContext` signature without a cast; both
            // are the same object at runtime, since this rule is only ever invoked with `ctx` below.
            const rule = required<T>({
                test: custom && (innerValue => custom(innerValue, ctx)),
            });

            const result = rule(value, ctx);
            if (!result) {
                return undefined;
            }

            if (options.message) {
                return options.message(value, ctx);
            }

            return toFormValidationResult(result);
        },
        behavior: requiredBehavior(lazy),
    });
}
