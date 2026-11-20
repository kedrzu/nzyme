import type { Injectable } from '@nzyme/ioc/Injectable.js';
import type { SecretsProvider } from '@nzyme/secrets/commands/SecretsCommandsOptions.js';
import type { SecretDefinition } from '@nzyme/secrets/defineSecret.js';

import type { GoogleClientProvider } from './GoogleClientProvider.js';

/** How a Google command set finds its OAuth clients and its accounts. */
export interface GoogleAuthOptions {
    /**
     * The project's service resolving to its `SecretsProvider`: the token secret is read from its
     * stores and written through its `target`, which must return a store listed in `stores` so a
     * written token is read back.
     */
    provider: Injectable<SecretsProvider>;
    /**
     * The declared secret (`defineSecret`) holding every signed-in account of the service, a JSON
     * dictionary by email. When the provider declares its secrets, it must be among them.
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
