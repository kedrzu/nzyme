import type { ValidationContext, Validator } from '../Validator.js';

export type RequiredValidatorParams<T> = {
    message?: (params: ValidationContext & { value: T | null | undefined }) => string;
};

export function requiredValidator<T>(
    params?: RequiredValidatorParams<T>,
): Validator<T | null | undefined> {
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
