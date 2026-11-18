/** A CDP event as the browser sends it; `sessionId` is set for an event of an attached session. */
export interface CdpEvent {
    method: string;
    /** The event's parameters, unchecked JSON: read them through a type guard. */
    params: unknown;
    sessionId?: string;
}

/** The `error` member of a CDP reply. */
export interface CdpErrorReply {
    code: number;
    message: string;
    data?: string;
}

/** A call the browser answered with an error; `code` and `message` are the browser's. */
export class CdpError extends Error {
    /** The browser's error code (`-32601` for an unknown method, `-32602` for bad parameters, `-32000` otherwise). */
    readonly code: number;
    /** The browser's detail, when it gave one. */
    readonly data?: string;

    constructor(reply: CdpErrorReply) {
        super(reply.message);
        this.name = 'CdpError';
        this.code = reply.code;
        this.data = reply.data;
    }
}
