import type { Logger } from './Logger.js';

/** Data attached to an ApplicationError, extending standard ErrorOptions with arbitrary fields. */
export interface ApplicationErrorData extends ErrorOptions {
    /**
     * A logger instance.
     */
    logger?: Logger;

    [key: string]: unknown;
}

/** An error type for application-level failures that carries structured data. */
export class ApplicationError extends Error {
    public readonly data: ApplicationErrorData;

    /** Creates a new ApplicationError with the given message and structured data. */
    constructor(message: string, data: ApplicationErrorData) {
        super(message, data);

        this.data = data;
        this.name = 'ApplicationError';
    }
}
