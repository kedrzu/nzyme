import type { ValidatorMessage } from './Validator.js';

/**
 * Represents types that can be compared using relational operators (<, >, <=, >=)
 */
export type Comparable = bigint | number | Date;

/**
 * Anything with a numeric `length` — strings, arrays and array-likes.
 */
export interface WithLength {
    length: number;
}

/**
 * Options shared by the bound validators (min/max length, value and date).
 */
export interface BoundValidatorOptions<T> {
    /**
     * Whether the bound itself is invalid (strict comparison).
     * @default false
     */
    exclusive?: boolean;
    /**
     * Overrides the default message.
     */
    message?: ValidatorMessage<T>;
}

/**
 * Options shared by validators whose only configuration is the message.
 */
export interface ValidatorOptions<T> {
    /**
     * Overrides the default message.
     */
    message?: ValidatorMessage<T>;
}
