/** How a wait for the OAuth redirect ended. */
export type OAuthCallbackResult =
    /** The authorization code to exchange. */
    | { kind: 'code'; code: string }
    /** The person declined, or the provider refused the request. */
    | { kind: 'denied'; error: string }
    /** Nobody answered within `timeoutMs`. */
    | { kind: 'timeout' };

/** Parameters for {@link listenForOAuthCallback}. */
export interface ListenForOAuthCallbackParams {
    /**
     * The loopback redirect URI registered for the OAuth client, `http://localhost:<port><path>` or
     * `http://127.0.0.1:<port><path>`. Port `0` listens on any free port, for a provider that accepts
     * any loopback port.
     */
    redirectUri: string;
    /** The `state` sent in the authorize URL. */
    state: string;
    /** How long to wait for the person at the browser before giving up. */
    timeoutMs: number;
}

/** A callback server listening for one sign-in. */
export interface OAuthCallbackListener {
    /** The redirect URI to send in the authorize URL: the given one, port `0` replaced by the port taken. */
    redirectUri: string;
    /** How the wait ended; the server has stopped by the time it settles. */
    result: Promise<OAuthCallbackResult>;
}

/**
 * Starts the loopback server of an OAuth sign-in with PKCE: it listens on 127.0.0.1 only — the code
 * never reaches the network, and a browser following a `localhost` redirect falls back to 127.0.0.1
 * when `::1` refuses — at the redirect URI's port, until the redirect carrying `state` arrives, the
 * person declines, or `timeoutMs` passes. A request carrying another state, or neither a code nor an
 * error, is refused without ending the wait, so a stray tab or a replayed URL cannot end the real
 * sign-in nor be exchanged as if it were ours.
 *
 * Call it before opening the browser: it throws at once on a redirect URI that is not loopback HTTP
 * with a port, and on a port another process holds, with a message saying what to do. Runs on Bun.
 */
export function listenForOAuthCallback(params: ListenForOAuthCallbackParams): OAuthCallbackListener {
    const redirect = parseRedirectUri(params.redirectUri);
    const { promise, resolve } = Promise.withResolvers<OAuthCallbackResult>();
    const server = listen();
    const timer = setTimeout(() => resolve({ kind: 'timeout' }), params.timeoutMs);

    const redirectUri = new URL(redirect);
    redirectUri.port = String(server.port);

    return { redirectUri: redirectUri.href, result: settle() };

    async function settle() {
        try {
            return await promise;
        } finally {
            clearTimeout(timer);
            // Graceful: the page answering the redirect reaches the browser before the socket goes away.
            await server.stop();
        }
    }

    function listen() {
        const port = Number(redirect.port);
        try {
            return Bun.serve({ hostname: '127.0.0.1', port, fetch: request => answer(new URL(request.url)) });
        } catch (error) {
            if (error instanceof Error && 'code' in error && error.code === 'EADDRINUSE') {
                throw new Error(
                    `Port ${port} of the redirect URI ${params.redirectUri} is in use: another sign-in or app ` +
                        'listens on it. Stop it and run the sign-in again.',
                    { cause: error },
                );
            }

            throw error;
        }
    }

    function answer(url: URL) {
        if (url.pathname !== redirect.pathname) {
            return new Response(null, { status: 404, headers: { connection: 'close' } });
        }

        if (url.searchParams.get('state') === params.state) {
            const code = url.searchParams.get('code');
            if (code) {
                resolve({ kind: 'code', code });
                return page(200, 'Done — you can close this tab and return to the terminal.');
            }

            const error = url.searchParams.get('error');
            if (error) {
                resolve({ kind: 'denied', error });
                return page(200, 'The sign-in was cancelled. Return to the terminal.');
            }
        }

        return page(400, 'This is not the sign-in that is waiting here.');
    }
}

/** Throws unless the redirect URI is `http://localhost:<port><path>` or `http://127.0.0.1:<port><path>`. */
function parseRedirectUri(redirectUri: string) {
    const url = URL.parse(redirectUri);
    if (
        !url ||
        url.protocol !== 'http:' ||
        (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') ||
        !url.port
    ) {
        throw new Error(
            `The redirect URI must be http://localhost:<port><path> or http://127.0.0.1:<port><path>; got ${redirectUri}.`,
        );
    }

    return url;
}

function page(status: number, text: string) {
    const html = `<!doctype html><meta charset="utf-8"><title>Sign-in</title><p>${text}</p>`;
    // `connection: close`, so the browser keeps no connection that would hold the server's graceful stop.
    return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8', connection: 'close' } });
}
