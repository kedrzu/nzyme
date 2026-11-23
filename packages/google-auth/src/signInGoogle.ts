import { randomBytes } from 'node:crypto';

import { CodeChallengeMethod } from 'google-auth-library';

import { listenForOAuthCallback } from '@nzyme/node-utils/listenForOAuthCallback.js';
import { openInBrowser } from '@nzyme/node-utils/openInBrowser.js';

import type { GoogleClientCredentials } from './GoogleClientProvider.js';
import type { GoogleToken } from './googleTokens.js';
import type { GoogleService } from './GoogleService.js';
import { createOAuthClient } from './utils/createOAuthClient.js';
import { errorMessage } from './utils/errorMessage.js';

const TIMEOUT_MS = 5 * 60 * 1000;

/** Options of {@link signInGoogle}. */
export interface SignInGoogleParams {
    /** The OAuth client to sign in with. It must be a Desktop-app client. */
    credentials: GoogleClientCredentials;
    /** The token endpoint to use instead of Google's (tests). */
    tokenUrl: string | undefined;
    service: GoogleService;
    /** Passed to `service.resolveEmail`. */
    apiRootUrl: string | undefined;
    /** The account to preselect on Google's account chooser. */
    loginHint?: string;
    /** Whether to try opening the sign-in URL in the default browser. */
    openBrowser: boolean;
    /** Shows a line to the person signing in (the sign-in URL among them). */
    print(line: string): void;
}

/**
 * Signs an account in with the installed-app OAuth flow: a loopback redirect on 127.0.0.1 and PKCE.
 * A Desktop-app client accepts any `http://127.0.0.1:<port>` redirect, so nothing stays running.
 * Requires a refresh token and every scope of the service. Errors never carry a credential.
 */
export async function signInGoogle(params: SignInGoogleParams): Promise<GoogleToken> {
    const { service } = params;
    const client = createOAuthClient(params.credentials, params.tokenUrl);
    const state = randomBytes(16).toString('hex');
    const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
    // A Desktop-app client accepts any loopback port, so the server takes a free one.
    const callback = listenForOAuthCallback({ redirectUri: 'http://127.0.0.1:0/', state, timeoutMs: TIMEOUT_MS });
    const { redirectUri } = callback;

    const url = client.generateAuthUrl({
        access_type: 'offline',
        // Always returns a refresh token, also on a repeated sign-in.
        prompt: 'consent',
        scope: [...service.scopes],
        state,
        login_hint: params.loginHint,
        redirect_uri: redirectUri,
        code_challenge: codeChallenge,
        code_challenge_method: CodeChallengeMethod.S256,
    });

    params.print(`Sign in with Google in the browser. If it did not open, visit:\n${url}`);
    if (params.openBrowser) {
        openInBrowser(url);
    }

    const result = await callback.result;
    switch (result.kind) {
        case 'timeout':
            throw new Error('Timed out after 5 minutes waiting for the Google sign-in.');
        case 'denied':
            throw new Error(`Google sign-in failed: ${result.error}`);
        case 'code':
            break;
    }

    const tokens = await exchangeCode(result.code);
    const refreshToken = tokens.refresh_token;
    if (!refreshToken) {
        throw new Error(
            "Google returned no refresh token. Remove the app's access at https://myaccount.google.com/permissions and sign in again.",
        );
    }

    const granted = (tokens.scope ?? '').split(' ');
    const missing = service.scopes.filter(scope => !granted.includes(scope));
    if (missing.length > 0) {
        throw new Error(
            `Not every permission was granted (missing: ${missing.join(', ')}). ` +
                'Sign in again and tick every checkbox on the consent screen.',
        );
    }

    client.setCredentials(tokens);
    // Errors keep only their message here: an HTTP client's error carries the request, credentials included.
    const email = await service.resolveEmail(client, params.apiRootUrl).catch((error: unknown) => {
        throw new Error(`Signed in, but the account's address could not be read: ${errorMessage(error)}`);
    });

    return { email, refreshToken, scopes: granted };

    async function exchangeCode(received: string) {
        const response = await client
            .getToken({ code: received, codeVerifier, redirect_uri: redirectUri })
            .catch((error: unknown) => {
                throw new Error(`Google refused the sign-in code: ${errorMessage(error)}`);
            });
        return response.tokens;
    }
}
