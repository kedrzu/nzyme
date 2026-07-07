import type { ValidationContext, Validator } from '../Validator.js';

/**
 * Context object passed to minLength validator
 */
export interface MinLengthValidatorContext<T extends WithLength> extends ValidationContext {
    /**
     * Minimum length
     */
    minLength: number;
    /**
     * Value to validate
     */
    value: T;
}

/**
 * Options for minLength validator
 */
export interface MinLengthValidatorOptions<T extends WithLength> {
    /**
     * Message to return if validation fails
     */
    message?: (ctx: MinLengthValidatorContext<T>) => string;
}

type WithLength = {
    length: number;
};

/**
 * Validator that checks if the value has at least the specified length
 * @util
 * @param minLength - The minimum length to check against.
 * @param options - Options for the validator.
 * @returns A validator function.
 */
export function minLength<T extends WithLength>(
    minLength: number,
    options?: MinLengthValidatorOptions<T>,
): Validator<T | null | undefined> {
    const message = options?.message;

    return (value, ctx) => {
        if (value == null) {
            return;
        }

        const valid = value.length >= minLength;
        if (valid) {
            return;
        }

        if (message) {
            return message({ ...ctx, minLength, value });
        }

        return `Minimum length is ${minLength}`;
    };
}
