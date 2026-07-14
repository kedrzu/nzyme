import { HttpError } from '@nzyme/fetch-utils/HttpError.js';

/**
 * Structured error data returned in RPC error responses.
 */
export interface RpcErrorData {
    /** Machine-readable error identifier */
    error: string;
    /** Human-readable error message */
    message: string;
    /** Optional stack trace for debugging */
    stack?: string;
}

/**
 * Error thrown when an RPC call returns a non-OK response with structured error data.
 *
 * Extends {@link HttpError} so callers can narrow on a single error type regardless of whether the
 * failure carried structured data (`RpcError`) or not (`FetchError`); `status` is inherited from it.
 */
export class RpcError extends HttpError {
    /**
     * The response that caused the error
     */
    public readonly response: Response;

    /**
     * The error data
     */
    public readonly data: RpcErrorData;

    /** Creates an RpcError from a failed HTTP response and its parsed error data. */
    constructor(response: Response, data: RpcErrorData) {
        super(response.status, data.message);
        this.name = 'RpcError';
        this.data = data;
        this.response = response;
    }
}
