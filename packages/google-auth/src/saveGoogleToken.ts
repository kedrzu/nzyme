import { UsageError } from '@nzyme/cli-core';

import type { GoogleToken } from './googleTokens.js';
import { parseGoogleTokens, serializeGoogleTokens } from './googleTokens.js';
import type { GoogleTokenStorage } from './GoogleTokenStorage.js';
import { isAccountAllowed } from './utils/isAccountAllowed.js';

/** Params of {@link saveGoogleToken}. */
export interface SaveGoogleTokenParams {
    storage: GoogleTokenStorage;
    /** The token secret, named in errors. */
    secretName: string;
    /** The account just signed in. */
    token: GoogleToken;
    /** The project's `accounts` allowlist; unset allows every account. */
    allowed: string[] | undefined;
}

/**
 * Adds or replaces the account's entry in the token dictionary and keeps every other one. Call it
 * after the browser step: it reads the dictionary right before writing, so an account signed in
 * meanwhile is kept (best effort, stores offer no compare-and-set). Refuses an account the allowlist
 * does not allow and a stored value that is not a dictionary; nothing is written then.
 */
export async function saveGoogleToken(params: SaveGoogleTokenParams): Promise<void> {
    const { storage, secretName, token } = params;
    const email = token.email.toLowerCase();
    if (!isAccountAllowed(email, params.allowed)) {
        throw new UsageError(`${token.email} is not in the accounts this project allows; its token was not stored.`);
    }

    const tokens = parseGoogleTokens(await storage.read(), secretName);
    tokens.set(email, { refreshToken: token.refreshToken, scopes: token.scopes });
    await storage.write(serializeGoogleTokens(tokens));
}
