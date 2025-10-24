/**
 *
 */
export interface RpcErrorData {
    /**
     *
     */
    error: string;
    /**
     *
     */
    message: string;
    /**
     *
     */
    stack?: string;
}

/**
 *
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

    /**
     *
     */
    constructor(response: Response, data: RpcErrorData) {
        super(data.message);
        this.name = 'RpcError';
        this.data = data;
        this.response = response;
        this.status = response.status;
    }
}
