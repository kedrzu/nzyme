import type { Logger } from './Logger.js';

/**
 *
 */
export interface ApplicationErrorData extends ErrorOptions {
    /**
     * A logger instance.
     */
    logger?: Logger;

    [key: string]: unknown;
}

/**
 *
 */
export class ApplicationError extends Error {
    public readonly data: ApplicationErrorData;

    /**
     *
     */
    constructor(message: string, data: ApplicationErrorData) {
        super(message, data);

        this.data = data;
        this.name = 'ApplicationError';
    }
}
