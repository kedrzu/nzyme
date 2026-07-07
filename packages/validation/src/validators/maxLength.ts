import type { ValidationContext, Validator } from '../Validator.js';

/**
 * Context object passed to minLength validator
 */
export interface MaxLengthValidatorContext<T extends WithLength> extends ValidationContext {
    /**
     * Maximum length
     */
    maxLength: number;
    /**
     * Value to validate
     */
    value: T;
}

/**
 * Options for maxLength validator
 */
export interface MaxLengthValidatorOptions<T extends WithLength> {
    /**
     * Message to return if validation fails
     */
    message?: (ctx: MaxLengthValidatorContext<T>) => string;
}

type WithLength = {
    length: number;
};

/**
 * Validator that checks if the value has at most the specified length
 * @util
 * @param maxLength - The maximum length to check against.
 * @param options - Options for the validator.
 * @returns A validator function.
 */
export function maxLength<T extends WithLength>(
    maxLength: number,
    options?: MaxLengthValidatorOptions<T>,
): Validator<T | null | undefined> {
    const message = options?.message;

    return (value, ctx) => {
        if (value == null) {
            return;
        }

        const valid = value.length <= maxLength;
        if (valid) {
            return;
        }

        if (message) {
            return message({ ...ctx, maxLength, value });
        }

        return `Maximum length is ${maxLength}`;
    };
}
