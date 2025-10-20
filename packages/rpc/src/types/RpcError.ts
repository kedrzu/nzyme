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
     *
     */
    public readonly data: RpcErrorData;

    /**
     *
     */
    constructor(data: RpcErrorData) {
        super(data.message);
        this.name = 'RpcError';
        this.data = data;
    }
}
