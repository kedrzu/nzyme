/** The request header carrying the trace label of the test that sent the request. */
export const TRACE_LABEL_HEADER = 'x-nzyme-trace';

/**
 * The cookie carrying the trace label, for what a header cannot reach: a browser's WebSocket
 * handshake.
 */
export const TRACE_LABEL_COOKIE = 'nzyme-trace';

/**
 * The trace label of an incoming request: its {@link TRACE_LABEL_HEADER} header, else its
 * {@link TRACE_LABEL_COOKIE} cookie. Pass it to `traceScope` at the entry point.
 * @__NO_SIDE_EFFECTS__
 */
export function readTraceLabel(headers: Headers): string | undefined {
    const header = headers.get(TRACE_LABEL_HEADER);
    if (header) {
        return header;
    }

    for (const cookie of headers.get('cookie')?.split(';') ?? []) {
        const separator = cookie.indexOf('=');
        if (separator > 0 && cookie.slice(0, separator).trim() === TRACE_LABEL_COOKIE) {
            return cookie.slice(separator + 1).trim() || undefined;
        }
    }
    return undefined;
}
