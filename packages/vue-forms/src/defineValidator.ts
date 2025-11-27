import type { FormValidator, FormValidatorAsync, FormValidatorSync } from './types.js';

/**
 *
 */
export function defineValidator<T>(validator: FormValidatorSync<T>): FormValidatorSync<T>;
/**
 *
 */
export function defineValidator<T, W = unknown>(validator: FormValidatorAsync<T, W>): FormValidatorAsync<T>;
/**
 *
 */
export function defineValidator<T>(validator: FormValidator<T>) {
    return validator;
}
