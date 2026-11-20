import { OAuth2Client } from 'google-auth-library';

import { UsageError } from '@nzyme/cli-core';
import { CommandScope } from '@nzyme/cli-core/Command.js';
import { Container } from '@nzyme/ioc/Container.js';
import { defineFactory } from '@nzyme/ioc/Factory.js';
import { mergeStores, readStores } from '@nzyme/secrets/utils/readStores.js';

import type { GoogleCommandParams } from './GoogleCommandParams.js';
import { GoogleEndpoints } from './GoogleEndpoints.js';
import type { GoogleToken } from './googleTokenKey.js';
import { googleTokenKey, googleTokenKeyPrefix, parseGoogleToken } from './googleTokenKey.js';
import { matchesGlob } from './utils/matchesGlob.js';

/** A signed-in account of the service, as `list()` reports it. */
export interface GoogleAccount {
    email: string;
    /** The scopes granted at sign-in. */
    scopes: string[];
    /** Whether the `accounts` option lets the project use it. */
    allowed: boolean;
}

/** Where {@link GoogleAccountsShape.saveToken} wrote a token. */
export interface GoogleSavedToken {
    key: string;
    storeId: string;
}

/**
 * The accounts of one Google service in one command run. The stores are read once, on first use;
 * every error names the account and the sign-in command, and never carries a credential.
 */
export interface GoogleAccountsShape {
    /** Every signed-in account of the service, allowed or not, sorted by email. */
    list(): Promise<GoogleAccount[]>;
    /**
     * The account a command acts on: `account` when given (it must be signed in and allowed),
     * otherwise the only usable account. Throws a `UsageError` listing the usable accounts otherwise.
     */
    resolveAccount(account: string | undefined): Promise<string>;
    /** An OAuth client authorised as the account, with a fresh access token. */
    authorize(email: string): Promise<OAuth2Client>;
    /** An OAuth client of the project's client id and secret, without credentials (for sign-in). */
    createClient(): Promise<OAuth2Client>;
    /**
     * Writes a signed-in token through the provider's `target`. Refuses an account the `accounts`
     * option does not allow, and a key that already holds another email; nothing is written then.
     */
    saveToken(token: GoogleToken): Promise<GoogleSavedToken>;
}

/**
 * Creates the accounts of a Google service for one command run.
 * @param binaryName The CLI binary, so the sign-in command in errors can be run as is.
 */
export const GoogleAccountsFactory = defineFactory({
    name: 'GoogleAccountsFactory',
    // Per command: the provider is resolved from the command's container.
    scope: CommandScope,
    deps: { container: Container, endpoints: GoogleEndpoints },
    setup({ container, endpoints }, params: GoogleCommandParams, binaryName: string): GoogleAccountsShape {
        const { service, options } = params;
        const provider = container.resolve(options.provider);
        const keyPrefix = options.keyPrefix ?? 'GOOGLE_';
        const clientIdKey = options.clientIdKey ?? 'GOOGLE_CLIENT_ID';
        const clientSecretKey = options.clientSecretKey ?? 'GOOGLE_CLIENT_SECRET';
        const signInCommand = `${binaryName} ${params.prefix} auth`;
        let secrets: Promise<Map<string, string>> | undefined;

        return { list, resolveAccount, authorize, createClient, saveToken };

        async function list() {
            const tokens = await readTokens();
            return tokens
                .map(token => ({ email: token.email, scopes: token.scopes, allowed: isAllowed(token.email) }))
                .toSorted((a, b) => a.email.localeCompare(b.email));
        }

        async function resolveAccount(account: string | undefined) {
            if (account) {
                return (await findToken(account)).email;
            }

            const usable = (await list()).filter(entry => entry.allowed);
            const [only] = usable;
            if (only && usable.length === 1) {
                return only.email;
            }

            if (!only) {
                throw new UsageError(
                    `No ${service.name} account is signed in and allowed. Sign in with \`${signInCommand}\`.`,
                );
            }

            const emails = usable.map(entry => entry.email).join(', ');
            throw new UsageError(`Several ${service.name} accounts are usable; choose one with --account: ${emails}.`);
        }

        async function authorize(email: string) {
            const token = await findToken(email);
            const auth = await createClient();
            auth.setCredentials({ refresh_token: token.refreshToken });

            // Access tokens are never stored: every run refreshes once, here, so a revoked token fails
            // now with the sign-in command rather than inside an API call.
            await auth.getAccessToken().catch((error: unknown) => {
                throw refreshError(token.email, error);
            });

            return auth;
        }

        /**
         * Only the message is kept, never the cause: the HTTP client's error carries the request, the
         * refresh token in its body among it.
         */
        function refreshError(email: string, error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes('invalid_grant')) {
                return new UsageError(
                    `Google rejected the refresh token of ${email} (revoked or expired). ` +
                        `Sign in again with \`${signInCommand} --login-hint ${email}\`.`,
                );
            }

            return new Error(`Could not refresh the access token of ${email}: ${message}`);
        }

        async function createClient() {
            const all = await readSecrets();
            const clientId = all.get(clientIdKey);
            const clientSecret = all.get(clientSecretKey);
            const missing = [clientId ? undefined : clientIdKey, clientSecret ? undefined : clientSecretKey].filter(
                key => key !== undefined,
            );
            if (missing.length > 0) {
                throw new UsageError(
                    `The Google OAuth client is not configured: ${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} missing from the secret stores. ` +
                        `Add ${missing.length > 1 ? 'them' : 'it'} to the project's secret store, ` +
                        `then sign in with \`${signInCommand}\`.`,
                );
            }

            return new OAuth2Client({
                clientId,
                clientSecret,
                endpoints: endpoints.oauthTokenUrl ? { oauth2TokenUrl: endpoints.oauthTokenUrl } : {},
            });
        }

        async function saveToken(token: GoogleToken) {
            if (!isAllowed(token.email)) {
                throw new UsageError(
                    `${token.email} is not in the accounts this project allows; its token was not stored.`,
                );
            }

            const key = googleTokenKey({ keyPrefix, service, email: token.email });
            const existing = (await readSecrets()).get(key);
            const holder = existing ? parseGoogleToken(existing) : undefined;
            if (holder && holder.email.toLowerCase() !== token.email.toLowerCase()) {
                throw new UsageError(
                    `${key} already holds the token of ${holder.email}, which maps to the same key as ${token.email}; ` +
                        'nothing was written.',
                );
            }

            // The project's write policy; it throws to refuse the key, before anything is written.
            const store = provider.target(key);
            await store.write([{ key, value: JSON.stringify(token) }]);
            return { key, storeId: store.id };
        }

        async function findToken(email: string) {
            const token = (await readTokens()).find(entry => entry.email.toLowerCase() === email.toLowerCase());
            if (!token) {
                throw new UsageError(
                    `${email} has no ${service.name} token. Sign in with \`${signInCommand} --login-hint ${email}\`.`,
                );
            }

            if (!isAllowed(token.email)) {
                throw new UsageError(`${token.email} is signed in, but not in the accounts this project allows.`);
            }

            return token;
        }

        function isAllowed(email: string) {
            return options.accounts?.some(pattern => matchesGlob(email, pattern)) ?? true;
        }

        async function readTokens() {
            const prefix = googleTokenKeyPrefix(keyPrefix, service);
            const tokens: GoogleToken[] = [];
            for (const [key, value] of await readSecrets()) {
                const token = key.startsWith(prefix) ? parseGoogleToken(value) : undefined;
                if (token) {
                    tokens.push(token);
                }
            }

            return tokens;
        }

        function readSecrets() {
            secrets ??= readStores(provider.stores).then(mergeStores);
            return secrets;
        }
    },
});
