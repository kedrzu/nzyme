import type { Validator } from '../Validator.js';

/**
 *
 */
export type DefineValidatorOptions<T> = ValidatorOptions<T> & {
    /**
     *
     */
    validator: (value: T) => boolean;
};

/**
 *
 */
export type ValidatorOptions<T> = {
    /**
     *
     */
    message: (params: {
        /**
         *
         */
        value: T;
    }) => string;
};

/**
 *
 * @__NO_SIDE_EFFECTS__
 */
export function defineValidator<T>(
    options: DefineValidatorOptions<T>,
): Validator<null | T | undefined> {
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

        return 'Invalid value';
    };
}
