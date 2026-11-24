import type { Injectable } from '@nzyme/ioc/Injectable.js';
import type { SecretDefinition } from '@nzyme/secrets/defineSecret.js';
import type { SecretStore } from '@nzyme/secrets/SecretStore.js';

/** How a Linear command set signs the person in and keeps their OAuth grant. */
export interface LinearAuthOptions {
    /**
     * The service resolving to the store the sign-in lives in. It is per person (the keychain), never a
     * shared team store. The auth service is unscoped, resolved from the root container, so the store's
     * service must not be `CommandScope`-scoped either.
     */
    store: Injectable<SecretStore>;
    /** The secret holding the grant, a JSON object with the access token, the refresh token and the expiry. */
    token: SecretDefinition;
    /** The OAuth client id of the Linear app; it uses PKCE, so no client secret exists. */
    clientId: string;
    /** The scopes the sign-in asks for (`read`, `write`…). */
    scopes: string[];
    /** The redirect URI registered on the Linear app, loopback `http://localhost:<port><path>`. */
    redirectUri: string;
    /** The command that signs the person in, named in every "sign in again" message. */
    signInCommand: string;
    /**
     * The workspace (its `urlKey`) the sign-in accepts. When set, a sign-in into another workspace is
     * refused and nothing is stored.
     */
    organization?: string;
    /**
     * Secrets a successful sign-in removes from the store, after the new grant is stored (the personal
     * API key this sign-in supersedes). Skipped when the store cannot delete.
     */
    replaces?: SecretDefinition[];
}
