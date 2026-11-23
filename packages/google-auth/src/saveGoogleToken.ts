import { UsageError } from '@nzyme/cli-core';

import type { GoogleAuthShape } from './defineGoogleAuth.js';
import type { GoogleToken } from './googleTokens.js';
import { parseGoogleTokens, serializeGoogleTokens } from './googleTokens.js';
import { isAccountAllowed } from './utils/isAccountAllowed.js';

/** Params of {@link saveGoogleToken}. */
export interface SaveGoogleTokenParams {
    /** The command set's auth: its token secret and its `accounts` allowlist. */
    auth: GoogleAuthShape;
    /** The account just signed in. */
    token: GoogleToken;
}

/**
 * Adds or replaces the account's entry in the token dictionary and keeps every other one. Call it
 * after the browser step: it reads the dictionary right before writing, so an account signed in
 * meanwhile is kept (best effort, stores offer no compare-and-set). Refuses an account the allowlist
 * does not allow and a stored value that is not a dictionary; nothing is written then.
 */
export async function saveGoogleToken({ auth, token }: SaveGoogleTokenParams): Promise<void> {
    const email = token.email.toLowerCase();
    if (!isAccountAllowed(email, auth.allowed)) {
        throw new UsageError(`${token.email} is not in the accounts this project allows; its token was not stored.`);
    }

    const tokens = parseGoogleTokens(await auth.readTokens(), auth.secretName);
    tokens.set(email, { refreshToken: token.refreshToken, scopes: token.scopes });
    await auth.writeTokens(serializeGoogleTokens(tokens));
}
