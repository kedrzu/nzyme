import type { Validator } from '../Validator.js';

export type ValidatorOptions<T> = {
    message: (params: { value: T }) => string;
};

export type DefineValidatorOptions<T> = ValidatorOptions<T> & {
    validator: (value: T) => boolean;
};

export function defineValidator<T>(
    options: DefineValidatorOptions<T>,
): Validator<T | null | undefined> {
    const { message, validator } = options;

    return (value, ctx) => {
        if (value == null) {
            return;
        }

        if (validator(value)) {
            return;
        }

        if (message) {
            return message({ ...ctx, value });
        }

        return 'Wartość jest nieprawidłowa';
    };
}
