import { Fetch } from '@nzyme/ioc/Fetch.js';
import { defineService } from '@nzyme/ioc/Service.js';
import { ApplicationError } from '@nzyme/logging/ApplicationError.js';
import { immutable } from '@nzyme/utils/immutable.js';
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

import { readSlackUserTokenGrant } from './readSlackUserTokenGrant.js';
import type { SlackUserTokenGrant } from './readSlackUserTokenGrant.js';
import type { SlackAuthOptions } from './SlackAuthOptions.js';
import { SlackSignInRequiredError } from './SlackSignInRequiredError.js';

/** The developer's own Slack user token, kept valid across Slack's token rotation. */
export interface SlackAuthShape {
    /**
     * A user token valid for more than the refresh margin, read from the store on every call. An
     * expiring one is refreshed and the new grant stored first. Throws {@link SlackSignInRequiredError}
     * when no complete sign-in is stored, or when Slack refuses its refresh token.
     */
    get(): Promise<string>;
    /** Writes a grant to the store, under the token secret. */
    store(grant: SlackUserTokenGrant): Promise<void>;
    options: SlackAuthOptions;
}

/**
 * A token is refreshed this long before it expires, so whoever got it does not see it die halfway
 * through a long-running command holding its client.
 */
const REFRESH_MARGIN_MS = 60 * 60 * 1000;

/**
 * `oauth.v2.access` errors that mean the stored sign-in is gone, so only a new one helps. Every other
 * `ok: false` (`internal_error`, `service_unavailable`, `ratelimited`…) may pass on its own.
 */
const SIGN_IN_REFUSALS = immutable(
    new Set(['invalid_refresh_token', 'token_expired', 'token_revoked', 'invalid_auth']),
);

/** A grant as it sits in the token secret, a JSON object. */
interface StoredGrant {
    accessToken: string;
    refreshToken: string;
    /** When the access token expires, in ms since the epoch. */
    expiresAt: number;
}

/**
 * Defines the service keeping the developer's Slack user token usable. The Slack app uses PKCE, and
 * Slack rotates a PKCE app's user tokens: the access token lives 12 hours and a refresh token issues
 * the next pair, with no client secret. The sign-in lives in one secret of one store, so every
 * process shares it, and `get()` reads it on every call — past the store's cache before refreshing,
 * so a long-running process takes what another process stored instead of spending a refresh token
 * that is already spent.
 *
 * Two processes refreshing at the same moment are not coordinated: the loser's refresh token is
 * refused and it asks for a new sign-in.
 *
 * Unscoped, unlike the commands, so code outside a command can resolve it from the root container.
 * @__NO_SIDE_EFFECTS__
 */
export function defineSlackAuth(options: SlackAuthOptions) {
    return defineService({
        name: 'SlackAuth',
        deps: { secretStore: options.store, fetch: Fetch },
        setup({ secretStore, fetch }): SlackAuthShape {
            const secretName = options.token.name;

            return { get, store, options };

            async function get() {
                let current = await readGrant();
                if (current && !isUsable(current)) {
                    // A cached read may be stale: another process may have refreshed since.
                    await secretStore.refresh?.();
                    current = await readGrant();
                }

                if (!current) {
                    throw new SlackSignInRequiredError('No Slack sign-in is stored', options.signInCommand);
                }

                if (isUsable(current)) {
                    return current.accessToken;
                }

                const refreshed = await refresh(current.refreshToken);
                if (!refreshed) {
                    throw new SlackSignInRequiredError('Your Slack sign-in has expired', options.signInCommand);
                }

                await store(refreshed);
                return refreshed.accessToken;
            }

            async function store(grant: SlackUserTokenGrant) {
                const stored: StoredGrant = {
                    accessToken: grant.accessToken,
                    refreshToken: grant.refreshToken,
                    expiresAt: Date.now() + grant.expiresIn * 1000,
                };
                await secretStore.write([{ key: secretName, value: JSON.stringify(stored) }]);
            }

            async function readGrant() {
                const value = (await secretStore.readAll()).get(secretName);
                return value ? parseStoredGrant(value) : null;
            }

            /**
             * The next grant, or `null` when Slack refuses the refresh token. Any other failure throws an
             * {@link ApplicationError}, which a caller polling Slack retries.
             */
            async function refresh(refreshToken: string): Promise<SlackUserTokenGrant | null> {
                const response = await fetch('https://slack.com/api/oauth.v2.access', {
                    method: 'POST',
                    body: new URLSearchParams({
                        client_id: options.clientId,
                        grant_type: 'refresh_token',
                        refresh_token: refreshToken,
                    }),
                });
                if (!response.ok) {
                    throw new ApplicationError('Slack did not answer the token refresh', { status: response.status });
                }

                const body: unknown = await response.json();
                if (!isPlainObject(body) || typeof body.ok !== 'boolean') {
                    throw new ApplicationError('Slack did not answer the token refresh', {});
                }

                if (!body.ok) {
                    const error = typeof body.error === 'string' ? body.error : undefined;
                    if (error && SIGN_IN_REFUSALS.has(error)) {
                        return null;
                    }

                    throw new ApplicationError('Slack did not answer the token refresh', { error });
                }

                const grant = readSlackUserTokenGrant(body);
                if (!grant) {
                    throw new ApplicationError(
                        'Slack refreshed the token without the access token, refresh token and expiry',
                        {},
                    );
                }

                return grant;
            }
        },
    });
}

/** The stored grant, or `null` unless the value is JSON carrying all three of its fields. */
function parseStoredGrant(value: string): StoredGrant | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        return null;
    }

    if (!isPlainObject(parsed)) {
        return null;
    }

    const { accessToken, refreshToken, expiresAt } = parsed;
    if (typeof accessToken !== 'string' || typeof refreshToken !== 'string' || typeof expiresAt !== 'number') {
        return null;
    }

    return { accessToken, refreshToken, expiresAt };
}

function isUsable(grant: StoredGrant) {
    return grant.expiresAt - Date.now() > REFRESH_MARGIN_MS;
}
