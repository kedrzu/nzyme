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

/** A client's CDP command, past its message shape: `params` is always an object, `sessionId` a string when set. */
export interface CdpRequest {
    method: string;
    params: Record<string, unknown>;
    sessionId?: string;
}

/** The end of a client's connection the proxy writes to; Bun's `ServerWebSocket` is one. */
export interface CdpSocket {
    send(text: string): void;
    close(code?: number, reason?: string): void;
}

/** What a policy may do with a request: pass it on (rewritten or not), answer it itself, or refuse it with a reason. */
export type CdpPolicyResult = CdpRequest | { reply: object } | { reject: string };

/** The client a policy judges a request of. */
export interface CdpPolicyClient<D> {
    /** Unique per connection. */
    id: string;
    /** The group whose pages the client sees; none: every page but the proxy's own. */
    group?: string;
    /** What the caller passed to `connect` for this client. */
    data: D;
    /** The target one of the client's own sessions is attached to; `undefined` for any other session. */
    sessionTarget(sessionId: string): string | undefined;
}

/**
 * The caller's judgement of a client's request, run after the proxy's own checks of sessions and targets and before
 * its stealth rules. A rewritten request is held to both again, so a policy cannot reach what the client could not.
 */
export type CdpPolicy<D> = (
    request: CdpRequest,
    client: CdpPolicyClient<D>,
) => CdpPolicyResult | Promise<CdpPolicyResult>;
