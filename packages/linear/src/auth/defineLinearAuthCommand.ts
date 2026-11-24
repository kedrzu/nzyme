import type { CommandClass } from '@nzyme/cli-core/Command.js';
import { Command } from '@nzyme/cli-core/Command.js';
import type { Injectable } from '@nzyme/ioc/Injectable.js';
import { createPkcePair } from '@nzyme/node-utils/createPkcePair.js';
import { listenForOAuthCallback } from '@nzyme/node-utils/listenForOAuthCallback.js';
import { openInBrowser } from '@nzyme/node-utils/openInBrowser.js';
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

import { getCommandPaths } from '../utils/getCommandPaths.js';
import { requestLinearGraphql } from '../utils/requestLinearGraphql.js';
import { LINEAR_TOKEN_URL, readLinearGrant } from './defineLinearAuth.js';
import type { LinearAuthShape, LinearGrant } from './defineLinearAuth.js';

const AUTH_TIMEOUT_MS = 5 * 60 * 1000;
const AUTHORIZE_URL = 'https://linear.app/oauth/authorize';

/** Parameters of {@link defineLinearAuthCommand}. */
export interface LinearAuthCommandParams {
    /** The command prefix, as for the other Linear commands. */
    prefix?: string;
    /** The command set's unit from `defineLinearAuth`. */
    auth: Injectable<LinearAuthShape>;
}

/**
 * Defines `<prefix> auth`: signs the person in to Linear through the product's Linear app and stores
 * their grant in the auth's token secret. The app uses PKCE, so the redirect lands straight on this
 * process at `http://localhost` and no client secret exists anywhere. A sign-in into a workspace other
 * than the configured one is refused before anything is stored. Nothing secret is ever printed.
 * @__NO_SIDE_EFFECTS__
 */
export function defineLinearAuthCommand(params: LinearAuthCommandParams): CommandClass {
    const paths = getCommandPaths(params, 'auth');
    const name = (paths[0] ?? []).join(' ');

    return class LinearAuthCommand extends Command {
        static override paths = paths;
        static override usage = Command.Usage({
            category: 'Linear',
            description: 'Sign in to Linear and store your access token',
            details:
                'Opens the Linear consent page for the Linear app, catches the redirect on the localhost redirect ' +
                'URI registered on it, exchanges the code (PKCE, no client secret) and stores the token in your ' +
                'personal secret store.',
            examples: [['Sign in to Linear', name]],
        });

        async run(): Promise<number> {
            const auth = this.container.resolve(params.auth);
            const { clientId, scopes, redirectUri, organization, replaces, token } = auth.options;
            const state = crypto.randomUUID();
            const pkce = createPkcePair();
            // Before the browser opens: a bad redirect URI or a taken port fails here, not after consent.
            const callback = listenForOAuthCallback({ redirectUri, state, timeoutMs: AUTH_TIMEOUT_MS });

            const authorizeUrl = buildAuthorizeUrl({
                clientId,
                scopes,
                redirectUri,
                state,
                codeChallenge: pkce.challenge,
            });
            this.context.stdout.write(`Opening Linear in your browser. If it does not open, visit:\n${authorizeUrl}\n`);
            openInBrowser(authorizeUrl);

            const result = await callback.result;
            switch (result.kind) {
                case 'timeout':
                    this.context.stderr.write(`No answer from Linear within 5 minutes — run \`${name}\` again.\n`);
                    return 1;
                case 'denied':
                    this.context.stderr.write(`Linear did not authorize the app (${result.error}).\n`);
                    return 1;
                case 'code':
                    break;
            }

            const grant = await this.exchangeCode(auth, result.code, pkce.verifier);
            if (!grant) {
                return 1;
            }

            const identity = await this.readIdentity(grant.accessToken);
            if (!identity) {
                return 1;
            }

            if (organization != null && identity.urlKey !== organization) {
                this.context.stderr.write(
                    `Signed in to the Linear workspace ${identity.urlKey}, but this CLI accepts only ${organization} — ` +
                        `run \`${name}\` again and pick that workspace.\n`,
                );
                return 1;
            }

            await auth.store(grant);
            // Only now: the old secrets stay until the new sign-in is safely stored.
            if (replaces?.length) {
                const names = replaces.map(secret => secret.name);
                try {
                    await this.container.resolve(auth.options.store).delete?.(names);
                } catch (error) {
                    // The sign-in is stored and works; a leftover old secret is no reason to fail it.
                    this.context.stderr.write(
                        `Could not remove ${names.join(', ')} from your secret store (${error instanceof Error ? error.message : String(error)}) — ` +
                            'nothing reads it any more; remove it by hand.\n',
                    );
                }
            }

            this.context.stdout.write(`Signed in to Linear as ${identity.name} (workspace ${identity.urlKey}).\n`);
            this.context.stdout.write(`${token.name} stored in your personal secret store.\n`);
            return 0;
        }

        /**
         * Exchanges the authorization code for the grant, proving it with the PKCE verifier instead of a
         * client secret. A refusal is reported by Linear's `error` code alone, never the body.
         */
        private async exchangeCode(auth: LinearAuthShape, code: string, codeVerifier: string) {
            const response = await fetch(LINEAR_TOKEN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    grant_type: 'authorization_code',
                    code,
                    redirect_uri: auth.options.redirectUri,
                    client_id: auth.options.clientId,
                    code_verifier: codeVerifier,
                }).toString(),
            });

            const body: unknown = await response.json().catch(() => undefined);
            const grant: LinearGrant | null = response.ok ? readLinearGrant(body) : null;
            if (!grant) {
                const error = isPlainObject(body) && typeof body.error === 'string' ? body.error : undefined;
                this.context.stderr.write(
                    `Linear refused the code exchange (${error ?? `HTTP ${response.status}`}) — check the client id ` +
                        `configured for this CLI against the Linear app, then run \`${name}\` again.\n`,
                );
                return null;
            }

            return grant;
        }

        /** Who the new token belongs to, or `null` after saying why Linear did not tell. */
        private async readIdentity(accessToken: string) {
            const response = await requestLinearGraphql({
                authorization: `Bearer ${accessToken}`,
                query: '{ viewer { name organization { urlKey name } } }',
            });

            const viewer = isPlainObject(response.data) ? response.data.viewer : undefined;
            const organization = isPlainObject(viewer) ? viewer.organization : undefined;
            if (
                !isPlainObject(viewer) ||
                !isPlainObject(organization) ||
                typeof viewer.name !== 'string' ||
                typeof organization.urlKey !== 'string'
            ) {
                this.context.stderr.write(
                    `Linear did not say who signed in (HTTP ${response.status}) — run \`${name}\` again.\n`,
                );
                return null;
            }

            return { name: viewer.name, urlKey: organization.urlKey };
        }
    };
}

/** What the authorize URL carries. */
interface AuthorizeUrlParams {
    clientId: string;
    scopes: string[];
    redirectUri: string;
    state: string;
    codeChallenge: string;
}

/** The Linear consent page of a PKCE authorization-code request. */
function buildAuthorizeUrl(params: AuthorizeUrlParams): string {
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set('client_id', params.clientId);
    url.searchParams.set('redirect_uri', params.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', params.scopes.join(','));
    url.searchParams.set('state', params.state);
    url.searchParams.set('code_challenge', params.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
}
