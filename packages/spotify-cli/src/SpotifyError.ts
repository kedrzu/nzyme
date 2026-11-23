import { ApplicationError } from '@nzyme/logging/ApplicationError.js';

/** Params of {@link SpotifyError}. */
export interface SpotifyErrorParams {
    /** What was attempted, in words (`token refresh`, `playlist create`). */
    operation: string;
    /** The HTTP status Spotify answered. */
    status: number;
    /** On a 429: the seconds Spotify asked to wait (`Retry-After`), when it said. */
    retryAfter?: number;
    /** On a 429: Spotify's `error.reason` code (`QUOTA_EXCEEDED`), when it gave one. */
    reason?: string;
}

/**
 * A Spotify answer the caller cannot act on. The message is built from the operation and the status
 * (plus the wait and the reason code of a 429), never from the response body: Spotify's bodies echo
 * submitted values, and the message becomes an issue title.
 */
export class SpotifyError extends ApplicationError {
    /** What was attempted. */
    readonly operation: string;
    /** The HTTP status Spotify answered. */
    readonly status: number;

    /** Creates the error; `operation`, `status` and the 429 details become its data. */
    constructor(params: SpotifyErrorParams) {
        const { operation, status, retryAfter, reason } = params;
        super(formatMessage(params), { operation, status, retryAfter, reason });
        this.name = 'SpotifyError';
        this.operation = operation;
        this.status = status;
    }
}

function formatMessage({ operation, status, retryAfter, reason }: SpotifyErrorParams) {
    if (status !== 429) {
        return `Spotify ${operation} failed with HTTP ${status}.`;
    }

    const wait = retryAfter == null ? 'without saying how long to wait' : `asking to wait ${retryAfter} s`;
    return `Spotify rate-limited the ${operation} (HTTP 429), ${wait}${reason ? `; reason: ${reason}` : ''}.`;
}
