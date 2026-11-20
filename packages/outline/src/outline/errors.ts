/**
 * An Outline call that failed with an HTTP error status. `message` comes from the server and has the
 * access token scrubbed out; the request (and so the token) is never attached.
 */
export class OutlineApiError extends Error {
    constructor(
        readonly method: string,
        readonly status: number,
        message: string,
        readonly code?: string,
    ) {
        super(`Outline ${method} failed (${status}): ${message}`);
        this.name = 'OutlineApiError';
    }
}

/** 409: the document changed since `lastRevision`; pull it again before writing. */
export class OutlineConflictError extends OutlineApiError {
    constructor(method: string, message: string, code?: string) {
        super(method, 409, message, code);
        this.name = 'OutlineConflictError';
    }
}

/** Outline kept answering 429 after every wait for `Retry-After`. */
export class OutlineRateLimitError extends OutlineApiError {
    constructor(method: string, message: string, code?: string) {
        super(method, 429, message, code);
        this.name = 'OutlineRateLimitError';
    }
}

/** The request never produced an HTTP response (network down, DNS, TLS). */
export class OutlineNetworkError extends Error {
    constructor(method: string, message: string) {
        super(`Outline ${method} could not be reached: ${message}`);
        this.name = 'OutlineNetworkError';
    }
}
