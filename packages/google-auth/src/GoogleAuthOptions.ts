import type { Injectable } from '@nzyme/ioc/Injectable.js';
import type { SecretDefinition } from '@nzyme/secrets/defineSecret.js';
import type { SecretStore } from '@nzyme/secrets/SecretStore.js';

import type { GoogleClientProvider } from './GoogleClientProvider.js';

/** How a Google command set finds its OAuth clients and its accounts. */
export interface GoogleAuthOptions {
    /**
     * The project's service resolving to the store the token secret lives in: it is read from and
     * written to this store only. A refresh token acts as its owner, so it is a per-developer store
     * (the keychain), never a shared team store.
     */
    store: Injectable<SecretStore>;
    /**
     * The secret (`defineSecret`) holding every signed-in account of the service, a JSON dictionary by
     * email.
     */
    tokens: SecretDefinition;
    /** The project's service giving the OAuth client of an account. */
    client: Injectable<GoogleClientProvider>;
    /**
     * The accounts the project may use: emails or `*` globs, case-insensitive. Unset, every signed-in
     * account is usable; an empty list allows none.
     */
    accounts?: string[];
}
