/**
 * The payload for an HTTP error.
 */
export interface HttpErrorPayload {
    /**
     * The error message.
     */
    message: string;

    /**
     * Additional error properties.
     */
    [key: string]: unknown;
}

/**
 * A custom error class for HTTP errors.
 *
 * @example
 * const error = new HttpError(404, 'Not Found');
 * console.log(error.status); // 404
 * console.log(error.message); // 'Not Found'
 */
export class HttpError extends Error {
    /**
     * The HTTP error payload.
     */
    public readonly payload: HttpErrorPayload;

    /**
     * The HTTP status code.
     */
    public readonly status: number;

    /**
     * @param status - The HTTP status code.
     * @param message - The error message.
     * @param options - The error options.
     */
    constructor(status: number, message: string | HttpErrorPayload, options?: ErrorOptions) {
        if (typeof message === 'object') {
            super(message.message, options);
            this.payload = message;
        } else {
            super(message, options);
            this.payload = { message };
        }

        this.status = status;
        this.name = 'HttpError';
    }
}
