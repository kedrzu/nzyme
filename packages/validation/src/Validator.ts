import type { Container } from '@nzyme/ioc/Container.js';

/**
 * Context object passed to validators during validation
 */
export interface ValidationContext {
    /** Language code for error messages */
    lang?: string;
    /** Container for dependency injection */
    container?: Container;
}

/**
 * Structure representing validation errors for multiple fields
 */
export interface ValidationErrors {
    /** Field name to error messages mapping */
    [key: string]: string[] | undefined;
}

/**
 * Possible return types from a validator function
 */
export type ValidationResult = string | string[] | ValidationErrors | null | undefined | void;

/**
 * Function type for validators
 * @template T - Type of the value being validated
 * @template C - Validation context the validator needs; rules pass their own context through
 */
export type Validator<T = unknown, C extends ValidationContext = ValidationContext> = (
    value: T,
    ctx: C,
) => ValidationResult;

/**
 * Overrides a validator's default message. Receives the failing value; returns an already-translated message.
 */
export type ValidatorMessage<T> = (value: T, ctx: ValidationContext) => string;
