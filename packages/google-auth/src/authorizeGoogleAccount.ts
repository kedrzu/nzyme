import type { OAuth2Client } from 'google-auth-library';

import { authorizeGoogle } from './authorizeGoogle.js';
import type { GoogleAuthShape } from './defineGoogleAuth.js';
import { parseGoogleTokens } from './googleTokens.js';
import type { GoogleService } from './GoogleService.js';
import { resolveGoogleAccount } from './resolveGoogleAccount.js';

/** Params of {@link authorizeGoogleAccount}. */
export interface AuthorizeGoogleAccountParams {
    auth: GoogleAuthShape;
    service: GoogleService;
    /** The account asked for (`--account`); unset picks the only usable one. */
    account: string | undefined;
    /** The command signing an account in, named in the errors. */
    signInCommand: string;
}

/** An account a command acts as. */
export interface GoogleAuthorizedAccount {
    email: string;
    /** Authorised as the account, with a fresh access token. */
    client: OAuth2Client;
}

/**
 * Picks the account a command acts on from the stored tokens (see `resolveGoogleAccount`) and
 * authorises it with the OAuth client the product gives for it.
 */
export async function authorizeGoogleAccount(params: AuthorizeGoogleAccountParams): Promise<GoogleAuthorizedAccount> {
    const { auth, signInCommand } = params;
    const tokens = parseGoogleTokens(await auth.storage.read(), auth.secretName);
    const { email, refreshToken } = resolveGoogleAccount({
        tokens,
        allowed: auth.allowed,
        account: params.account,
        service: params.service,
        signInCommand,
    });
    const client = await authorizeGoogle({
        credentials: await auth.clients.getClient(email),
        email,
        refreshToken,
        tokenUrl: auth.endpoints.oauthTokenUrl,
        signInCommand,
    });

    return { email, client };
}
