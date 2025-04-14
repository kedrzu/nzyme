import type { Comparable } from '../types.js';
import type { ValidationContext, Validator } from '../Validator.js';

/**
 *
 */
export interface MaxValidatorOptions<T extends Comparable> {
    /**
     *
     */
    maxValue: T;
    /**
     *
     */
    exclusive?: boolean;
    /**
     *
     */
    message?: (
        params: ValidationContext & {
            /**
             *
             */
            maxValue: T /**
             *
             */;
            value: T;
        },
    ) => string;
}

/**
 *
 */
export function maxValue<T extends Comparable>(
    options: MaxValidatorOptions<T>,
): Validator<null | T | undefined> {
    const { maxValue, exclusive, message } = options;

    return (value, ctx) => {
        if (value == null) {
            return;
        }

        const valid = exclusive ? value < maxValue : value <= maxValue;
        if (valid) {
            return;
        }

        if (message) {
            return message({ ...ctx, maxValue, value });
        }

        return `Maximum value is ${String(maxValue)}`;
    };
}
