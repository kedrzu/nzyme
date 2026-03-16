import type { Comparable } from '../types.js';
import type { ValidationContext, Validator } from '../Validator.js';

/**
 * Context object passed to minValue validator
 */
export interface MinValidatorContext<T extends Comparable> extends ValidationContext {
    /**
     * Minimum value
     */
    minValue: T;
    /**
     * Value to validate
     */
    value: T;
}

/**
 * Options for configuring the minValue validator behavior.
 */
export interface MinValidatorOptions<T extends Comparable> {
    /**
     * Whether to check if the value is strictly greater than the minimum value.
     * @default false
     */
    exclusive?: boolean;
    /**
     * The message to return if the value is less than the minimum value.
     */
    message?: (ctx: MinValidatorContext<T>) => string;
}

/**
 * Validator that checks if the value is greater than or equal to the minimum value.
 * @param minValue - The minimum value to check against.
 * @param options - Options for the validator.
 * @returns A validator function.
 */
export function minValue(minValue: number, options?: MinValidatorOptions<number>): Validator<number | null | undefined>;
/**
 * Validator that checks if the value is greater than or equal to the minimum value.
 * @param minValue - The minimum value to check against.
 * @param options - Options for the validator.
 * @returns A validator function.
 */
export function minValue(minValue: bigint, options?: MinValidatorOptions<bigint>): Validator<bigint | null | undefined>;
/**
 * Validator that checks if the value is greater than or equal to the minimum value.
 * @param minValue - The minimum value to check against.
 * @param options - Options for the validator.
 * @returns A validator function.
 */
export function minValue<T extends Comparable>(
    minValue: T,
    options?: MinValidatorOptions<T>,
): Validator<T | null | undefined>;
/**
 * Validator that checks if the value is greater than or equal to the minimum value.
 * @param minValue - The minimum value to check against.
 * @param options - Options for the validator.
 * @returns A validator function.
 */
export function minValue<T extends Comparable>(
    minValue: T,
    options?: MinValidatorOptions<T>,
): Validator<T | null | undefined> {
    const exclusive = options?.exclusive ?? false;
    const message = options?.message;

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
