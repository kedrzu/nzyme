import { UsageError } from '@nzyme/cli-core';
import { createPkcePair } from '@nzyme/node-utils/createPkcePair.js';
import { listenForOAuthCallback } from '@nzyme/node-utils/listenForOAuthCallback.js';
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
    const state = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url');
    const pkce = createPkcePair();
    const callback = listenForOAuthCallback({ redirectUri: params.redirectUri, state, timeoutMs: TIMEOUT_MS });

    const url = new URL(`${params.accountsUrl}/authorize`);
    url.search = new URLSearchParams({
        client_id: params.clientId,
        response_type: 'code',
        redirect_uri: params.redirectUri,
        code_challenge_method: 'S256',
        code_challenge: pkce.challenge,
        scope: SPOTIFY_SCOPES.join(' '),
        state,
    }).toString();

    params.print(`Sign in with Spotify in the browser. If it did not open, visit:\n${url.href}`);
    if (params.openBrowser) {
        openInBrowser(url.href);
    }

    const consent = await callback.result;
    switch (consent.kind) {
        case 'timeout':
            throw new Error('Timed out after 5 minutes waiting for the Spotify sign-in.');
        case 'denied':
            throw new Error(`Spotify sign-in failed: ${consent.error}`);
        case 'code':
            break;
    }

    const granted = await requestSpotifyToken({
        accountsUrl: params.accountsUrl,
        form: {
            grant_type: 'authorization_code',
            code: consent.code,
            redirect_uri: params.redirectUri,
            client_id: params.clientId,
            code_verifier: pkce.verifier,
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
