import { parseSlackAuthCallback } from './parseSlackAuthCallback.js';
import { parseSlackRedirectUri } from './parseSlackRedirectUri.js';

/** How a wait for the Slack OAuth redirect ended. */
export type SlackAuthWaitResult =
    | { kind: 'code'; code: string }
    | { kind: 'denied'; error: string }
    | { kind: 'timeout' };

/** Parameters for {@link waitForSlackAuthCallback}. */
export interface WaitForSlackAuthCallbackParams {
    /** The `localhost` redirect URI sent in the authorize URL; the server listens on its port and path. */
    redirectUri: string;
    /** The `state` sent in the authorize URL. */
    state: string;
    /** How long to wait for the developer before giving up. */
    timeoutMs: number;
}

const CLOSE_TAB_PAGE =
    '<!doctype html><title>Slack</title><p>Done — you can close this tab and return to the terminal.</p>';

/**
 * Listens on the redirect URI's port — loopback only; the developer's browser follows the redirect to
 * `localhost` and falls back to 127.0.0.1 when `::1` refuses — until the Slack redirect for this
 * `state` arrives, the developer declines, or `timeoutMs` passes. A callback carrying another state is
 * refused without ending the wait, so a stray tab cannot abort the real authorization. Throws when the
 * port is taken.
 */
export async function waitForSlackAuthCallback(params: WaitForSlackAuthCallbackParams): Promise<SlackAuthWaitResult> {
    const redirect = parseSlackRedirectUri(params.redirectUri);
    const { promise, resolve } = Promise.withResolvers<SlackAuthWaitResult>();

    const server = Bun.serve({
        hostname: '127.0.0.1',
        port: redirect.port,
        fetch(request) {
            const callback = parseSlackAuthCallback({
                url: new URL(request.url),
                state: params.state,
                callbackPath: redirect.path,
            });

            if (callback.kind === 'ignored') {
                return new Response('Not found', { status: 404 });
            }

            if (callback.kind === 'foreign') {
                return new Response('This authorization was not started by the sign-in waiting here.', {
                    status: 400,
                });
            }

            resolve(callback);
            return new Response(CLOSE_TAB_PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        },
    });

    const timeout = setTimeout(() => resolve({ kind: 'timeout' }), params.timeoutMs);

    try {
        return await promise;
    } finally {
        clearTimeout(timeout);
        // Let the "close this tab" page reach the browser before the socket goes away.
        await server.stop();
    }
}
