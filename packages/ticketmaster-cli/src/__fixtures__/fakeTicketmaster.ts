/** One request the fake received. */
export interface FakeTicketmasterRequest {
    path: string;
    query: URLSearchParams;
}

/** Answers a request path; the test supplies one per path. */
export type FakeTicketmasterHandler = (request: FakeTicketmasterRequest) => Response;

/** A running fake Ticketmaster. */
export interface FakeTicketmaster {
    /** Base url ending with `/discovery/v2/`. */
    baseUrl: string;
    requests: FakeTicketmasterRequest[];
    stop(): Promise<void>;
}

/** Starts a `Bun.serve` on a free port, recording requests and answering from per-path handlers (404 otherwise). */
export function startFakeTicketmaster(handlers: Record<string, FakeTicketmasterHandler>): FakeTicketmaster {
    const requests: FakeTicketmasterRequest[] = [];
    const server = Bun.serve({
        port: 0,
        fetch(req) {
            const url = new URL(req.url);
            const request = { path: url.pathname, query: url.searchParams };
            requests.push(request);
            const handler = handlers[url.pathname];
            return handler ? handler(request) : new Response('not found', { status: 404 });
        },
    });

    return {
        baseUrl: `http://localhost:${server.port}/discovery/v2/`,
        requests,
        stop: () => server.stop(true),
    };
}
