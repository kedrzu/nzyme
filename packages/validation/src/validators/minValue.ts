import type { Comparable } from '../types.js';
import type { ValidationContext, Validator } from '../Validator.js';

/**
 *
 */
export interface MinValidatorOptions<T extends Comparable> {
    /**
     *
     */
    minValue: T;
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
            minValue: T /**
             *
             */;
            value: T;
        },
    ) => string;
}

/**
 *
 */
export function minValue<T extends Comparable>(
    options: MinValidatorOptions<T>,
): Validator<null | T | undefined> {
    const { minValue, exclusive, message } = options;

    return (value, ctx) => {
        if (value == null) {
            return;
        }

        const valid = exclusive ? value > minValue : value >= minValue;
        if (valid) {
            return;
        }

        if (message) {
            return message({ ...ctx, minValue, value });
        }

        return `Minimum value is ${String(minValue)}`;
    };
}
