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
 */
export class RpcError extends Error {
    /**
     * The response that caused the error
     */
    public readonly response: Response;

    /**
     * The error data
     */
    public readonly data: RpcErrorData;

    /**
     * The status code of the response
     */
    public readonly status: number;

    /** Creates an RpcError from a failed HTTP response and its parsed error data. */
    constructor(response: Response, data: RpcErrorData) {
        super(data.message);
        this.name = 'RpcError';
        this.data = data;
        this.response = response;
        this.status = response.status;
    }
}
