import type { Injectable } from '@nzyme/ioc/Injectable.js';
import type { SecretDefinition } from '@nzyme/secrets/defineSecret.js';
import type { SecretStore } from '@nzyme/secrets/SecretStore.js';

/** How a Slack command set signs the developer in and keeps their user token. */
export interface SlackAuthOptions {
    /**
     * The project's service resolving to the store the sign-in lives in: it is read from and written to
     * this store only. It acts as the developer, so it is a per-developer store (the keychain), never a
     * shared team store. The auth service is unscoped, resolved from the root container, so the store's
     * service must not be `CommandScope`-scoped either.
     */
    store: Injectable<SecretStore>;
    /**
     * The secret (`defineSecret`) holding the developer's sign-in, a JSON object with the access token,
     * the refresh token and the access token's expiry.
     */
    token: SecretDefinition;
    /** The OAuth client id of the consumer's Slack app; it uses PKCE, so no client secret exists. */
    clientId: string;
    /** The user scopes the sign-in asks for: the scopes the Slack app declares for user tokens. */
    userScopes: string[];
    /**
     * The redirect URI registered on the Slack app, `http://localhost:<port><path>`: the sign-in waits
     * on that port and path. Slack accepts plain HTTP only on `localhost` for a PKCE app; `auth` refuses
     * a URI that is not loopback HTTP with a port before it opens the browser.
     */
    redirectUri: string;
    /** The command that signs the developer in, named in every "sign in again" message. */
    signInCommand: string;
}
