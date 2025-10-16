import type { FormValidator } from './types.js';

/**
 *
 */
export function defineValidator<T>(validator: FormValidator<T>) {
    return validator;
}
