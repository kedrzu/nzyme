import type { Validator } from '../Validator.js';

/**
 * Options for defining a validator, including the validation function and error message.
 */
export type DefineValidatorOptions<T> = ValidatorOptions<T> & {
    /** Function that returns true if the value is valid */
    validator: (value: T) => boolean;
};

/**
 * Common options shared by all validators.
 */
export type ValidatorOptions<T> = {
    /** Function that generates the error message when validation fails */
    message: (params: {
        /** The value that failed validation */
        value: T;
    }) => string;
};

/**
 * Creates a reusable validator that skips null/undefined values and returns an error message on failure.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function defineValidator<T>(options: DefineValidatorOptions<T>): Validator<T | null | undefined> {
    const { message, validator } = options;

    return (value, ctx) => {
        if (value == null) {
            return undefined;
        }

        if (validator(value)) {
            return undefined;
        }

        if (message) {
            return message({ ...ctx, value });
        }

        return 'Invalid value';
    };
}
