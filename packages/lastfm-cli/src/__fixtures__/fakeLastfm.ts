/**
 * A recording fake of the Last.fm API: it answers each request by its `method` query parameter from
 * canned responses, for running the client and its endpoints in-process.
 */

/** A canned answer: `json` is sent as JSON, `text` as it is (a broken body, an HTML error page). */
export interface FakeLastfmResponse {
    /** 200 when omitted. */
    status?: number;
    json?: unknown;
    text?: string;
}

/** Options of {@link startFakeLastfm}. */
export interface FakeLastfmOptions {
    /**
     * Answers by Last.fm method, matched case-insensitively as Last.fm does (`artist.getSimilar`). A
     * method without one gets Last.fm's error 3, "Invalid Method".
     */
    responses?: Record<string, FakeLastfmResponse>;
}

/** A request the fake received. */
export interface FakeLastfmRequest {
    /** The `method` query parameter, as sent. */
    method: string;
    /** The whole query, `api_key` and `format` included. */
    query: URLSearchParams;
    headers: Headers;
    /** When the request arrived, from `performance.now()`. */
    receivedAt: number;
}

/** A running {@link startFakeLastfm}. */
export interface FakeLastfm {
    /** The API root to give the client as `baseUrl`. */
    baseUrl: string;
    /** Every request received, in order. */
    requests: FakeLastfmRequest[];
    /** Sets or replaces the answer for a method. */
    respond(method: string, response: FakeLastfmResponse): void;
    stop(): Promise<void>;
}

/** Starts the fake on a free port. */
export function startFakeLastfm(options: FakeLastfmOptions = {}): FakeLastfm {
    const requests: FakeLastfmRequest[] = [];
    const responses = new Map<string, FakeLastfmResponse>();
    for (const [method, response] of Object.entries(options.responses ?? {})) {
        respond(method, response);
    }

    const server = Bun.serve({ port: 0, fetch: answer });

    return {
        baseUrl: new URL('/2.0/', server.url).href,
        requests,
        respond,
        stop: () => server.stop(true),
    };

    function respond(method: string, response: FakeLastfmResponse) {
        responses.set(method.toLowerCase(), response);
    }

    function answer(request: Request) {
        const receivedAt = performance.now();
        const query = new URL(request.url).searchParams;
        const method = query.get('method') ?? '';
        requests.push({ method, query, headers: request.headers, receivedAt });

        const response = responses.get(method.toLowerCase());
        if (!response) {
            return Response.json({
                error: 3,
                message: 'Invalid Method - No method with that name in this package',
                links: [],
            });
        }

        const status = response.status ?? 200;
        return response.text != null
            ? new Response(response.text, { status, headers: { 'Content-Type': 'text/html' } })
            : Response.json(response.json, { status });
    }
}

/** The URL of a port nothing listens on, for a refused connection. */
export async function getClosedLastfmUrl(): Promise<string> {
    const server = Bun.serve({ port: 0, fetch: () => new Response() });
    const url = new URL('/2.0/', server.url).href;
    await server.stop(true);
    return url;
}
