import { HttpError } from './HttpError.js';

/**
 * Custom error class for handling failed HTTP requests.
 * Provides access to the original Response object and commonly needed properties.
 */
export class FetchError extends HttpError {
    /** The URL that was requested */
    public readonly url: string;

    /**
     * Creates a new FetchError instance
     *
     * @param response - The Response object from the failed request
     * @param message - Optional error message (defaults to response.statusText)
     */
    constructor(
        /** The original Response object */
        public readonly response: Response,
        message?: string,
    ) {
        super(response.status, message || response.statusText);
        this.url = response.url;
        this.name = 'FetchError';
    }
}
