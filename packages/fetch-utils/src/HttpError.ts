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
     * @param status - The HTTP status code.
     * @param message - The error message.
     * @param options - The error options.
     */
    constructor(
        public readonly status: number,
        message: string,
        options?: ErrorOptions,
    ) {
        super(message, options);
        this.name = 'HttpError';
    }
}
