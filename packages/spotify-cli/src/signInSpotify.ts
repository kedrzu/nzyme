import { UsageError } from '@nzyme/cli-core';
import { openInBrowser } from '@nzyme/node-utils/openInBrowser.js';

import { createSpotifyApi } from './createSpotifyApi.js';
import { SpotifyError } from './SpotifyError.js';
import { SPOTIFY_SCOPES } from './spotifyScopes.js';
import type { SpotifyToken } from './spotifyToken.js';
import { requestSpotifyToken } from './utils/requestSpotifyToken.js';

const TIMEOUT_MS = 5 * 60 * 1000;

/** Options of {@link signInSpotify}. */
export interface SignInSpotifyParams {
    /** The Client ID of the project's Spotify app. */
    clientId: string;
    /** The redirect URI registered on the app; sign-in listens on its host and port. */
    redirectUri: string;
    accountsUrl: string;
    apiUrl: string;
    /** Whether to try opening the sign-in URL in the default browser. */
    openBrowser: boolean;
    /** Shows a line to the person signing in (the sign-in URL among them). */
    print(line: string): void;
}

/** A completed sign-in. */
export interface SpotifySignIn {
    /** The value to store in the token secret. */
    token: SpotifyToken;
    /** The account's display name, its user id when it has none. */
    displayName: string;
}

/**
 * Signs the account in with the Authorization Code flow and PKCE (S256, no client secret), waiting for
 * the redirect on the registered loopback URI for at most 5 minutes. Requires a refresh token and every
 * scope of `SPOTIFY_SCOPES`, then reads the account's id. Stores nothing. Errors never carry a
 * credential.
 */
export async function signInSpotify(params: SignInSpotifyParams): Promise<SpotifySignIn> {
    const redirect = parseRedirectUri(params.redirectUri);
    const state = base64Url(crypto.getRandomValues(new Uint8Array(16)));
    // 64 bytes: an 86-character verifier, within PKCE's 43 to 128.
    const codeVerifier = base64Url(crypto.getRandomValues(new Uint8Array(64)));
    const codeChallenge = base64Url(
        new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier))),
    );
    const callback = Promise.withResolvers<string>();

    const server = listen();
    let code: string;
    try {
        code = await waitForCode();
    } finally {
        await server.stop();
    }

    const granted = await requestSpotifyToken({
        accountsUrl: params.accountsUrl,
        form: {
            grant_type: 'authorization_code',
            code,
            redirect_uri: params.redirectUri,
            client_id: params.clientId,
            code_verifier: codeVerifier,
        },
    });
    if (!granted.ok) {
        const detail = granted.error ? `, ${granted.error}` : '';
        throw new Error(`Spotify refused the sign-in code (HTTP ${granted.status}${detail}).`);
    }

    const { accessToken, refreshToken, scope } = granted.token;
    if (!refreshToken) {
        throw new Error('Spotify returned no refresh token. Sign in again.');
    }

    const scopes = scope.split(' ').filter(Boolean);
    const missing = SPOTIFY_SCOPES.filter(required => !scopes.includes(required));
    if (missing.length > 0) {
        throw new UsageError(
            `Not every permission was granted (missing: ${missing.join(', ')}). Sign in again and accept them all.`,
        );
    }

    const profile = await readProfile(accessToken);
    return {
        token: { refreshToken, scopes, userId: profile.id, signedInAt: new Date().toISOString() },
        displayName: profile.displayName,
    };

    function listen() {
        const port = Number(redirect.port || 80);
        try {
            return Bun.serve({
                hostname: redirect.hostname,
                port,
                fetch: request => answerRedirect(new URL(request.url)),
            });
        } catch (error) {
            if (error instanceof Error && 'code' in error && error.code === 'EADDRINUSE') {
                throw new UsageError(
                    `Port ${port} of the redirect URI ${params.redirectUri} is in use: another sign-in or app ` +
                        'listens on it. Stop it and run the sign-in again.',
                );
            }

            throw error;
        }
    }

    async function waitForCode() {
        const url = new URL(`${params.accountsUrl}/authorize`);
        url.search = new URLSearchParams({
            client_id: params.clientId,
            response_type: 'code',
            redirect_uri: params.redirectUri,
            code_challenge_method: 'S256',
            code_challenge: codeChallenge,
            scope: SPOTIFY_SCOPES.join(' '),
            state,
        }).toString();

        params.print(`Sign in with Spotify in the browser. If it did not open, visit:\n${url.href}`);
        if (params.openBrowser) {
            openInBrowser(url.href);
        }

        const timer = setTimeout(
            () => callback.reject(new Error('Timed out after 5 minutes waiting for the Spotify sign-in.')),
            TIMEOUT_MS,
        );
        try {
            return await callback.promise;
        } finally {
            clearTimeout(timer);
        }
    }

    function answerRedirect(requestUrl: URL) {
        if (requestUrl.pathname !== redirect.pathname) {
            return new Response(null, { status: 404, headers: { connection: 'close' } });
        }

        const error = requestUrl.searchParams.get('error');
        const received = requestUrl.searchParams.get('code');
        if (requestUrl.searchParams.get('state') !== state || (!received && !error)) {
            return page({ status: 400, title: 'Unexpected request', body: 'This is not the sign-in that is waiting.' });
        }

        if (!received) {
            callback.reject(new Error(`Spotify sign-in failed: ${error}`));
            return page({
                status: 200,
                title: 'Sign-in cancelled',
                body: `Spotify answered: ${error}. You can close this tab.`,
            });
        }

        callback.resolve(received);
        return page({ status: 200, title: 'Signed in', body: 'Access is granted. You can close this tab.' });
    }

    async function readProfile(token: string) {
        const api = createSpotifyApi({ apiUrl: params.apiUrl, accessToken: token, signInCommand: undefined });
        const result = await api({ method: 'GET', path: '/me' });
        switch (result.status) {
            case 200: {
                const { id, display_name: displayName } = result.data;
                if (!id) {
                    throw new Error('Signed in, but Spotify returned a profile without a user id.');
                }

                return { id, displayName: displayName || id };
            }
            case 403:
                throw new UsageError(
                    'Signed in, but Spotify refused to read the profile (HTTP 403). An app in Development Mode ' +
                        "serves only the accounts added under User Management on the app's dashboard.",
                );
            default:
                throw new SpotifyError({ operation: 'profile read', status: result.status });
        }
    }
}

function parseRedirectUri(redirectUri: string) {
    const url = URL.parse(redirectUri);
    if (url?.protocol !== 'http:') {
        throw new UsageError(
            `The Spotify redirect URI must be a loopback http:// URL, like http://127.0.0.1:8888/callback; got ${redirectUri}.`,
        );
    }

    return url;
}

function base64Url(bytes: Uint8Array) {
    return Buffer.from(bytes).toString('base64url');
}

/** The browser page answering the sign-in redirect. */
interface PageParams {
    status: number;
    title: string;
    body: string;
}

function page({ status, title, body }: PageParams) {
    const html =
        `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
        `<body style="font-family:system-ui;max-width:32rem;margin:4rem auto"><h1>${title}</h1><p>${body}</p></body>`;
    // `connection: close`, so the browser keeps no connection that would hold the server's graceful stop.
    return new Response(html, { status, headers: { 'content-type': 'text/html', connection: 'close' } });
}
