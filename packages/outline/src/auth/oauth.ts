import { createHash, randomBytes } from 'node:crypto';

import { OutlineClient } from '../outline/OutlineClient.js';
import type { OutlineFetch } from '../outline/OutlineClient.js';
import type { OutlineAuthInfo } from '../outline/OutlineTypes.js';
import { acquireLock } from '../state/lock.js';
import { requestToken } from './tokens.js';
import type { OutlineTokenStore, TokenResponse } from './tokens.js';

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const LOCK_TIMEOUT_MS = 2 * 60 * 1000;
/** Outline turns a request without a scope into an empty one, which authorizes nothing. */
const SCOPE = 'read write';

export interface LoginOptions {
    /** Base URL of the workspace, e.g. `https://app.getoutline.com`. */
    url: string;
    /** The workspace's public OAuth client (Settings → Applications, redirect `http://127.0.0.1/callback`). */
    clientId: string;
    store: OutlineTokenStore;
    /** The sync lock; the tokens are written under it, so a refresh running meanwhile cannot overwrite them. */
    lockPath: string;
    /** Opens the authorize URL in the user's browser; macOS `open` by default. */
    openBrowser?: (url: string) => Promise<void>;
    /** How long to wait for the browser to come back. Five minutes by default. */
    timeoutMs?: number;
    fetch?: OutlineFetch;
    now?: () => number;
}

/** The browser flow ended without a login: denied, timed out, a forged callback, or a failed token exchange. */
export class LoginFailedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'LoginFailedError';
    }
}

/**
 * Logs in to Outline with the OAuth authorization code flow and PKCE: listens on a free loopback port, opens
 * the authorize page in the browser, takes the code from the callback (rejecting one whose `state` does not
 * match), exchanges it for tokens, checks them with `auth.info` and stores them. Resolves to who logged in.
 */
export async function login(options: LoginOptions): Promise<OutlineAuthInfo> {
    const baseUrl = options.url.replace(/\/+$/, '');
    const fetchImpl = options.fetch ?? fetch;
    const now = options.now ?? Date.now;
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const state = randomBytes(16).toString('base64url');

    const tokens = await authorize();
    const receivedAt = now();
    const client = new OutlineClient({
        url: baseUrl,
        getAccessToken: () => Promise.resolve(tokens.accessToken),
        fetch: fetchImpl,
    });
    const info = await client.auth.info();
    if (tokens.refreshToken == null) {
        throw new LoginFailedError('Outline issued no refresh token');
    }

    const lock = await acquireLock(options.lockPath, { timeoutMs: LOCK_TIMEOUT_MS });
    if (!lock) {
        throw new LoginFailedError('Timed out waiting for the sync lock to save the Outline login');
    }
    try {
        await options.store.write({
            accessToken: tokens.accessToken,
            accessTokenExpiresAt: receivedAt + tokens.expiresInSeconds * 1000,
            refreshToken: tokens.refreshToken,
        });
    } finally {
        await lock.release();
    }
    return info;

    /** Runs the browser part and the code exchange; the loopback server lives only for its duration. */
    async function authorize() {
        const result = Promise.withResolvers<TokenResponse>();
        let done = false;
        const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: handleCallback });
        const redirectUri = `http://127.0.0.1:${server.port}/callback`;
        const timer = setTimeout(
            () => finish(new LoginFailedError('Timed out waiting for the browser to finish the Outline login')),
            options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        );

        try {
            const authorizeUrl = new URL(`${baseUrl}/oauth/authorize`);
            authorizeUrl.search = new URLSearchParams({
                response_type: 'code',
                client_id: options.clientId,
                redirect_uri: redirectUri,
                scope: SCOPE,
                state,
                code_challenge: challenge,
                code_challenge_method: 'S256',
            }).toString();
            // Awaited together, so a callback that fails while the opener is still running is never unhandled.
            const [, response] = await Promise.all([
                (options.openBrowser ?? openInBrowser)(authorizeUrl.toString()),
                result.promise,
            ]);
            return response;
        } finally {
            clearTimeout(timer);
            done = true;
            await server.stop();
        }

        async function handleCallback(request: Request) {
            const { pathname, searchParams: params } = new URL(request.url);
            if (pathname !== '/callback') {
                return new Response('Not found', { status: 404 });
            }
            if (done) {
                return page(409, 'To logowanie zostało już zakończone. Wróć do terminala.');
            }
            if (params.get('state') !== state) {
                finish(new LoginFailedError('The OAuth callback carried a wrong state; the login was aborted'));
                return page(400, 'Logowanie przerwane: odpowiedź nie pochodzi z tego logowania. Wróć do terminala.');
            }
            const code = params.get('code');
            if (code == null) {
                const error = params.get('error') ?? 'no code';
                finish(new LoginFailedError(`Outline did not authorize the login (${error.slice(0, 100)})`));
                return page(400, 'Logowanie nie powiodło się. Wróć do terminala.');
            }
            done = true;
            try {
                finish(
                    await requestToken({
                        url: baseUrl,
                        fetch: fetchImpl,
                        params: {
                            grant_type: 'authorization_code',
                            code,
                            redirect_uri: redirectUri,
                            client_id: options.clientId,
                            code_verifier: verifier,
                        },
                    }),
                );
                return page(200, 'Zalogowano, możesz zamknąć tę kartę.');
            } catch (error) {
                finish(error instanceof Error ? error : new LoginFailedError('The token exchange failed'));
                return page(500, 'Logowanie nie powiodło się. Wróć do terminala.');
            }
        }

        function finish(outcome: TokenResponse | Error) {
            done = true;
            if (outcome instanceof Error) {
                result.reject(outcome);
            } else {
                result.resolve(outcome);
            }
        }
    }
}

async function openInBrowser(url: string) {
    // An argument array, never a shell: the URL is not parsed as a command line.
    const child = Bun.spawn(['open', url], { stdout: 'ignore', stderr: 'ignore' });
    const code = await child.exited;
    if (code !== 0) {
        throw new LoginFailedError(`Could not open the browser (open exited with ${code})`);
    }
}

function page(status: number, message: string) {
    const html = `<!doctype html><html lang="pl"><meta charset="utf-8"><title>Outline</title><p>${message}</p></html>`;
    return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
