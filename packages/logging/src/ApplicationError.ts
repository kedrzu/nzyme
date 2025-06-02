/**
 *
 */
export interface ApplicationErrorOptions extends ErrorOptions {
    [key: string]: unknown;
}

/**
 *
 */
export class ApplicationError extends Error {
    public readonly data: Record<string, unknown>;

    /**
     *
     */
    constructor(message: string, options: ApplicationErrorOptions) {
        super(message, options);

        this.data = options;
        this.name = 'ApplicationError';
    }
}
