import type { Injectable } from '@nzyme/ioc/Injectable.js';
import type { SecretsProvider } from '@nzyme/secrets/commands/SecretsCommandsOptions.js';
import type { SecretDefinition } from '@nzyme/secrets/defineSecret.js';

/** How a Spotify command set finds its app and the signed-in account. */
export interface SpotifyOptions {
    /**
     * The project's service resolving to its `SecretsProvider`: the token secret is read from its
     * stores and written through its `target`, which must return a store listed in `stores` so a
     * written token is read back.
     */
    provider: Injectable<SecretsProvider>;
    /**
     * The declared secret (`defineSecret`) holding the signed-in account's refresh token, as JSON.
     * When the provider declares its secrets, it must be among them.
     */
    token: SecretDefinition;
    /** The Client ID of the project's Spotify app; a declared secret works as it is. */
    clientId: Injectable<string>;
    /**
     * The redirect URI registered on the Spotify app, a loopback `http://127.0.0.1:<port>/<path>`
     * (Spotify rejects `localhost`). Default `http://127.0.0.1:8888/callback`; it must match the
     * registered one exactly.
     */
    redirectUri?: string;
}
