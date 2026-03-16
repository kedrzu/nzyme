import type { FormValidator, FormValidatorAsync, FormValidatorSync } from './types.js';

/** Defines a synchronous form field validator. */
export function defineValidator<T>(validator: FormValidatorSync<T>): FormValidatorSync<T>;
/** Defines an asynchronous form field validator. */
export function defineValidator<T, W = unknown>(validator: FormValidatorAsync<T, W>): FormValidatorAsync<T>;
/** Defines a form field validator (sync or async) with type inference. */
export function defineValidator<T>(validator: FormValidator<T>) {
    return validator;
}
