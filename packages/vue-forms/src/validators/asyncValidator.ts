import type { ValidationRule } from '@vuelidate/core';
import { helpers } from '@vuelidate/validators';

import { type PromiseWrapper, arrayRemove, createPromise } from '@nzyme/utils';

interface AsyncValidatorParams<TValue, TModel = unknown> {
    validator: (value: TValue, model: TModel) => Promise<boolean>;
    message: () => string;
}

/**
 * Async validators are prone to rat races.
 * Let us suppose we are validating a polish postal code.
 * It may happen that validation finishes in a different order than it was started.
 * - start validating value 12 (wrong postal code)
 * - start validating value 12-345 (correct postal code)
 * - validation for 12-345 finishes first and returns true
 * - validation for 12 finishes second and returns false
 *
 * We want to ignore the result of the first validation, because it is outdated.
 * This algorithm helps in this scenario.
 */
export function asyncValidator<TValue, TModel = unknown>(
    params: AsyncValidatorParams<TValue, TModel>,
) {
    // Store all validation promises in an array.
    const pending: PromiseWrapper<boolean>[] = [];
    const { validator, message } = params;

    return helpers.withAsync({
        $validator: (value: TValue, model: TModel) => {
            // Create a new resolvable promise and add it to the array.
            const promise = createPromise<boolean>();
            pending.push(promise);

            // Start validating the value.
            void validator(value, model)
                .then(result => {
                    // Once validation is done we resolve all promises,
                    // that were created before this one.
                    // Also we remove them from the array, so they won't affect future validations.
                    const index = pending.indexOf(promise);
                    for (let i = 0; i <= index; i++) {
                        pending.shift()?.resolve(result);
                    }
                })
                .catch(error => {
                    promise.reject(error);
                    arrayRemove(pending, promise);
                });

            return promise.promise;
        },
        $message: message,
    }) as ValidationRule;
}
