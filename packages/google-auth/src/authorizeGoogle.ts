import type { OAuth2Client } from 'google-auth-library';

import { UsageError } from '@nzyme/cli-core';

import type { GoogleClientCredentials } from './GoogleClientProvider.js';
import { createOAuthClient } from './utils/createOAuthClient.js';

/** Params of {@link authorizeGoogle}. */
export interface AuthorizeGoogleParams {
    /** The OAuth client the account signed in with. */
    credentials: GoogleClientCredentials;
    email: string;
    refreshToken: string;
    /** The token endpoint to use instead of Google's (tests). */
    tokenUrl: string | undefined;
    /** The command signing the account in, named when Google rejects the refresh token. */
    signInCommand: string;
}

/**
 * An OAuth client authorised as the account, with a fresh access token. Access tokens are never
 * stored: every run refreshes once, here, so a revoked token fails now with the sign-in command rather
 * than inside an API call. Errors never carry a credential.
 */
export async function authorizeGoogle(params: AuthorizeGoogleParams): Promise<OAuth2Client> {
    const { email, signInCommand } = params;
    const auth = createOAuthClient(params.credentials, params.tokenUrl);
    auth.setCredentials({ refresh_token: params.refreshToken });

    await auth.getAccessToken().catch((error: unknown) => {
        // Only the message is kept, never the cause: the HTTP client's error carries the request, the
        // refresh token in its body among it.
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('invalid_grant')) {
            throw new UsageError(
                `Google rejected the refresh token of ${email} (revoked or expired). ` +
                    `Sign in again with \`${signInCommand} --login-hint ${email}\`.`,
            );
        }

        throw new Error(`Could not refresh the access token of ${email}: ${message}`);
    });

    return auth;
}
