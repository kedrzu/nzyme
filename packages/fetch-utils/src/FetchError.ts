/**
 * Custom error class for handling failed HTTP requests.
 * Provides access to the original Response object and commonly needed properties.
 */
export class FetchError extends Error {
    /** The HTTP status code of the failed request */
    public readonly status: number;
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
        super(message || response.statusText);
        this.url = response.url;
        this.status = response.status;
    }
}
