import type { ValidationContext, Validator } from '../Validator.js';

/**
 *
 */
export interface MinLengthValidatorOptions<
    T extends {
        /**
         *
         */
        length: number;
    },
> {
    /**
     *
     */
    minLength: number;
    /**
     *
     */
    message?: (
        params: ValidationContext & {
            /**
             *
             */
            minLength: number /**
             *
             */;
            value: T;
        },
    ) => string;
}

/**
 *
 */
export function minLength<
    T extends {
        /**
         *
         */
        length: number;
    },
>(options: MinLengthValidatorOptions<T>): Validator<null | T | undefined> {
    const { minLength: minLength, message } = options;

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
