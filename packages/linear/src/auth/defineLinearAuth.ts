import { Fetch } from '@nzyme/ioc/Fetch.js';
import { defineService } from '@nzyme/ioc/Service.js';
import { ApplicationError } from '@nzyme/logging/ApplicationError.js';
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

import type { LinearAuthOptions } from './LinearAuthOptions.js';
import { LinearSignInRequiredError } from './LinearSignInRequiredError.js';

/** The URL both the code exchange and the refresh go to. */
export const LINEAR_TOKEN_URL = 'https://api.linear.app/oauth/token';

/** What a Linear sign-in or refresh issued. */
export interface LinearGrant {
    accessToken: string;
    refreshToken: string;
    /** Seconds the access token lives. */
    expiresIn: number;
}

/** The person's own Linear access token, kept valid across Linear's token expiry. */
export interface LinearAuthShape {
    /**
     * An access token valid for more than the refresh margin, read from the store on every call. An
     * expiring one is refreshed and the new grant stored first. Throws {@link LinearSignInRequiredError}
     * when no complete sign-in is stored, or when Linear refuses its refresh token.
     */
    get(): Promise<string>;
    /** Writes a grant to the store, under the token secret. */
    store(grant: LinearGrant): Promise<void>;
    options: LinearAuthOptions;
}

/** A token is refreshed this long before it expires, so it does not die halfway through a long command. */
const REFRESH_MARGIN_MS = 60 * 60 * 1000;

/** A grant as it sits in the token secret, a JSON object. */
interface StoredGrant {
    accessToken: string;
    refreshToken: string;
    /** When the access token expires, in ms since the epoch. */
    expiresAt: number;
}

/**
 * The grant in a Linear `oauth/token` answer, or `null` unless it carries the access token, the refresh
 * token and the expiry.
 * @__NO_SIDE_EFFECTS__
 */
export function readLinearGrant(answer: unknown): LinearGrant | null {
    if (!isPlainObject(answer)) {
        return null;
    }

    const { access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn } = answer;
    if (typeof accessToken !== 'string' || typeof refreshToken !== 'string' || typeof expiresIn !== 'number') {
        return null;
    }

    return { accessToken, refreshToken, expiresIn };
}

/**
 * Defines the service keeping the person's Linear access token usable. The Linear app uses PKCE, so a
 * refresh needs no client secret: the access token lives about a day and the refresh token issues the
 * next pair. The sign-in lives in one secret of one store, so every process shares it, and `get()`
 * reads it on every call — past the store's cache before refreshing, so a long-running process takes
 * what another process stored instead of spending a refresh token that is already spent.
 *
 * Unscoped, unlike the commands, so code outside a command can resolve it from the root container.
 * @__NO_SIDE_EFFECTS__
 */
export function defineLinearAuth(options: LinearAuthOptions) {
    return defineService({
        name: 'LinearAuth',
        deps: { secretStore: options.store, fetch: Fetch },
        setup({ secretStore, fetch }): LinearAuthShape {
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
                    throw new LinearSignInRequiredError('No Linear sign-in is stored', options.signInCommand);
                }

                if (isUsable(current)) {
                    return current.accessToken;
                }

                const refreshed = await refresh(current.refreshToken);
                if (!refreshed) {
                    throw new LinearSignInRequiredError('Your Linear sign-in has expired', options.signInCommand);
                }

                await store(refreshed);
                return refreshed.accessToken;
            }

            async function store(grant: LinearGrant) {
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
             * The next grant, or `null` when Linear refuses the refresh token (`invalid_grant`). Any other
             * failure throws an {@link ApplicationError} carrying no token.
             */
            async function refresh(refreshToken: string): Promise<LinearGrant | null> {
                const response = await fetch(LINEAR_TOKEN_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        grant_type: 'refresh_token',
                        refresh_token: refreshToken,
                        client_id: options.clientId,
                    }).toString(),
                });

                const body = await readJson(response);
                if (response.ok) {
                    const grant = readLinearGrant(body);
                    if (!grant) {
                        throw new ApplicationError(
                            'Linear refreshed the token without the access token, refresh token and expiry',
                            {},
                        );
                    }

                    return grant;
                }

                const error = isPlainObject(body) && typeof body.error === 'string' ? body.error : undefined;
                if (error === 'invalid_grant') {
                    return null;
                }

                throw new ApplicationError('Linear did not answer the token refresh', {
                    status: response.status,
                    error,
                });
            }
        },
    });
}

async function readJson(response: Response): Promise<unknown> {
    try {
        return await response.json();
    } catch {
        return undefined;
    }
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
