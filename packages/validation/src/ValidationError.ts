import type { ValidationErrors } from './Validator.js';

/**
 * Error class representing validation failures
 */
export class ValidationError extends Error {
    /** Validation errors for specific fields */
    public readonly errors: ValidationErrors;

    /**
     * Creates a validation error with a custom message
     * @param message - Custom error message
     */
    constructor(message: string);
    /**
     * Creates a validation error with a custom message and field errors
     * @param message - Custom error message
     * @param errors - Field-specific validation errors
     */
    constructor(message: string, errors: ValidationErrors);
    /**
     * Creates a validation error with field errors
     * @param errors - Field-specific validation errors
     */
    constructor(errors: ValidationErrors);
    /**
     * Creates a validation error
     * @param messageOrErrors - Either a custom message or field errors
     * @param errors - Optional field errors when message is provided
     */
    constructor(messageOrErrors: string | ValidationErrors, errors?: ValidationErrors) {
        let message: string;
        if (typeof messageOrErrors === 'string') {
            message = messageOrErrors;
        } else {
            message = 'Validation failed';
            errors = messageOrErrors;
        }

        super(message, { cause: errors });
        this.errors = errors || {};
        this.name = 'ValidationError';
    }
}
