import type { Container } from '@nzyme/ioc';

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
export type ValidationResult = null | string | string[] | undefined | ValidationErrors | void;

/**
 * Function type for validators
 * @template T - Type of the value being validated
 */
export type Validator<T = unknown> = (value: T, ctx: ValidationContext) => ValidationResult;
