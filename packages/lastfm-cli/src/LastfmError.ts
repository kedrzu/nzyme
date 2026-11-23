/** What a {@link LastfmError} is built from. */
export interface LastfmErrorOptions {
    /** The Last.fm method called, such as `artist.getSimilar`. */
    method: string;
    /** The Last.fm error code from the response body; `null` when the body carried none. */
    code: number | null;
    /** The HTTP status; `0` when no response arrived (a refused connection, a DNS failure). */
    status: number;
}

/**
 * A failed Last.fm call. It carries only the method, the Last.fm error code and the HTTP status: never
 * the URL (it holds the API key), the response or its body, and never a `cause` (Bun's fetch errors
 * carry the URL). A CLI logs the whole error object, so nothing here may hold the key.
 */
export class LastfmError extends Error {
    /** The Last.fm method called, such as `artist.getSimilar`. */
    public readonly method: string;
    /** The Last.fm error code (29 is the rate limit, 10 and 26 a bad API key); `null` when there was none. */
    public readonly code: number | null;
    /** The HTTP status; `0` when no response arrived. */
    public readonly status: number;

    /** Builds the message from the method, code and status alone. */
    public constructor(options: LastfmErrorOptions) {
        super(formatMessage(options));
        this.name = 'LastfmError';
        this.method = options.method;
        this.code = options.code;
        this.status = options.status;
    }
}

function formatMessage({ method, code, status }: LastfmErrorOptions) {
    if (status === 0) {
        return `Last.fm request failed: no response (${method})`;
    }

    switch (code) {
        case 29:
            return `Last.fm rate limit exceeded (${method})`;
        case 10:
            return `Last.fm rejected the API key as invalid (${method}, error 10)`;
        case 26:
            return `Last.fm API key is suspended (${method}, error 26)`;
        case null:
            return status >= 200 && status < 300
                ? `Last.fm returned a body that is not a JSON result (${method}, HTTP ${status})`
                : `Last.fm request failed with HTTP ${status} (${method})`;
        default:
            return `Last.fm error ${code} (${method}, HTTP ${status})`;
    }
}
