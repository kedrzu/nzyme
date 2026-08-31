import type { Comparable } from '../types.js';
import type { ValidationContext, Validator } from '../Validator.js';

/**
 * Context object passed to maxValue validator
 */
export interface MaxValidatorContext<T extends Comparable> extends ValidationContext {
    /**
     * Maximum value
     */
    maxValue: T;
    /**
     * Value to validate
     */
    value: T;
}

/**
 * Options for the maxValue validator.
 */
export interface MaxValidatorOptions<T extends Comparable> {
    /**
     * Whether to check if the value is strictly less than the maximum value.
     * @default false
     */
    exclusive?: boolean;
    /**
     * The message to return if the value is greater than the maximum value.
     */
    message?: (ctx: MaxValidatorContext<T>) => string;
}

/**
 * Validator that checks if the value is less than or equal to the maximum value.
 * @util
 * @param maxValue - The maximum value to check against.
 * @param options - Options for the validator.
 * @returns A validator function.
 */
export function maxValue(maxValue: number, options?: MaxValidatorOptions<number>): Validator<number | null | undefined>;
/**
 * Validator that checks if the value is less than or equal to the maximum value.
 * @param maxValue - The maximum value to check against.
 * @param options - Options for the validator.
 * @returns A validator function.
 */
export function maxValue(maxValue: bigint, options?: MaxValidatorOptions<bigint>): Validator<bigint | null | undefined>;
/**
 * Validator that checks if the value is less than or equal to the maximum value.
 * @param maxValue - The maximum value to check against.
 * @param options - Options for the validator.
 * @returns A validator function.
 */
export function maxValue(
    maxValue: Comparable,
    options?: MaxValidatorOptions<Comparable>,
): Validator<Comparable | null | undefined>;
/**
 * Validator that checks if the value is less than or equal to the maximum value.
 * @param maxValue - The maximum value to check against.
 * @param options - Options for the validator.
 * @returns A validator function.
 */
export function maxValue<T extends Comparable>(
    max: T,
    options?: MaxValidatorOptions<T>,
): Validator<T | null | undefined> {
    const exclusive = options?.exclusive ?? false;
    const message = options?.message;

    return (value, ctx) => {
        if (value == null) {
            return;
        }

        const valid = exclusive ? value < max : value <= max;
        if (valid) {
            return;
        }

        if (message) {
            return message({ ...ctx, maxValue: max, value });
        }

        return `Maximum value is ${String(max)}`;
    };
}
