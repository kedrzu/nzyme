import type { ValidationContext, Validator } from '../Validator.js';

/**
 * Parameters for configuring the required validator.
 */
export type RequiredValidatorParams<T> = {
    /** Custom error message function, called when the value is empty/missing */
    message?: (
        params: ValidationContext & {
            /** The value that was validated (null, undefined, or empty) */
            value: T | null | undefined;
        },
    ) => string;
};

/**
 * Creates a validator that ensures a value is present and non-empty.
 */
export function required<T>(params?: RequiredValidatorParams<T>): Validator<T | null | undefined> {
    const message = params && params.message;

    return (value, ctx) => {
        if (isValueNonEmpty(value)) {
            return;
        }

        if (message) {
            return message({ ...ctx, value });
        }

        return 'Field is required';
    };
}

function isValueNonEmpty(value: unknown): boolean {
    if (value == null || value === false) {
        return false;
    }

    if (typeof value === 'string' && value.trim() === '') {
        return false;
    }

    return true;
}
