import type { Injectable } from '@nzyme/ioc/Injectable.js';
import type { SecretsProvider } from '@nzyme/secrets/commands/SecretsCommandsOptions.js';
import type { SecretDefinition } from '@nzyme/secrets/defineSecret.js';

/** How a Slack command set signs the developer in and keeps their user token. */
export interface SlackAuthOptions {
    /**
     * The project's service resolving to its `SecretsProvider`: the token secret is read from its
     * stores and written through its `target`, which must return a store listed in `stores` so a
     * written token is read back. The auth service is unscoped, resolved from the root container, so
     * the provider must not be `CommandScope`-scoped either.
     */
    provider: Injectable<SecretsProvider>;
    /**
     * The declared secret (`defineSecret`) holding the developer's sign-in, a JSON object with the
     * access token, the refresh token and the access token's expiry. When the provider declares its
     * secrets, it must be among them. It acts as the developer, so it belongs in a per-developer store.
     */
    token: SecretDefinition;
    /** The OAuth client id of the consumer's Slack app; it uses PKCE, so no client secret exists. */
    clientId: string;
    /** The user scopes the sign-in asks for: the scopes the Slack app declares for user tokens. */
    userScopes: string[];
    /**
     * The redirect URI registered on the Slack app, `http://localhost:<port><path>`: the sign-in waits
     * on that port and path. Slack accepts plain HTTP only on `localhost` for a PKCE app, so any other
     * URI is refused when the auth is defined.
     */
    redirectUri: string;
    /** The command that signs the developer in, named in every "sign in again" message. */
    signInCommand: string;
}
