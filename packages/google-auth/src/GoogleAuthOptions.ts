import type { Injectable } from '@nzyme/ioc/Injectable.js';
import type { SecretsProvider } from '@nzyme/secrets/commands/SecretsCommandsOptions.js';

/**
 * How a Google command set finds its OAuth client and its accounts. One set uses one OAuth client; a
 * repo needing two registers two sets with different `keyPrefix`es.
 */
export interface GoogleAuthOptions {
    /**
     * The project's service resolving to its `SecretsProvider`: the client id and secret are read from
     * its stores and refresh tokens are written through its `target`. `target(key)` must return the
     * same store instance that is listed in `stores`, so a token written there is read back.
     */
    provider: Injectable<SecretsProvider>;
    /** Key of the OAuth client id. Default `GOOGLE_CLIENT_ID`. */
    clientIdKey?: string;
    /** Key of the OAuth client secret. Default `GOOGLE_CLIENT_SECRET`. */
    clientSecretKey?: string;
    /**
     * Prefix of the token keys, `<keyPrefix><service>_TOKEN_<SLUG>`. Default `GOOGLE_`. Two command
     * sets keep their tokens apart by setting different prefixes.
     */
    keyPrefix?: string;
    /**
     * The accounts the project may use: emails or `*` globs, case-insensitive. Unset, every account
     * with a token under the prefix is usable; an empty list allows none.
     */
    accounts?: string[];
}
