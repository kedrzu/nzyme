import type { Keychain } from '@nzyme/secrets/osKeychain.js';
import { keychainStore } from '@nzyme/secrets/keychainStore.js';

import type { OutlineFetch } from '../outline/OutlineClient.js';
import { acquireLock } from '../state/lock.js';

/** An access token with less time left than this is refreshed before use. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
/** Outline allows 100 token requests an hour; after a failed refresh no process retries for this long. */
const REFRESH_BACKOFF_MS = 60 * 1000;
const DEFAULT_LOCK_TIMEOUT_MS = 60 * 1000;

/** What the keychain item holds: the tokens of one Outline login and the outcome of the last failed refresh, shared by every process. */
export interface StoredOutlineTokens {
    accessToken: string;
    /** Epoch milliseconds. */
    accessTokenExpiresAt: number;
    refreshToken: string;
    /** Epoch milliseconds of the last refresh that failed for a reason worth retrying later. */
    refreshFailedAt?: number;
    /** Outline refused the refresh token (revoked, expired or replayed); only a new login helps. */
    refreshRejected?: boolean;
}

/** Where one workspace's tokens are kept. The whole record is one keychain item, so a write is all or nothing. */
export interface OutlineTokenStore {
    /** `null` when nothing (or nothing readable) is stored. */
    read(): Promise<StoredOutlineTokens | null>;
    write(tokens: StoredOutlineTokens): Promise<void>;
}

export interface OutlineTokenStoreOptions {
    /** Base URL of the workspace; its host keys the item, so two workspaces keep separate logins. */
    url: string;
    /** The OS keychain by default; tests pass an in-memory one. */
    keychain?: Keychain;
}

/**
 * The tokens of the workspace at `url`, kept in the keychain store scoped `outline`. They are read from the
 * keychain on every call, never loaded into env once like a `defineSecret`: a process that waited for the
 * sync lock must see the refresh token another process rotated meanwhile.
 * @__NO_SIDE_EFFECTS__
 */
export function outlineTokenStore(options: OutlineTokenStoreOptions): OutlineTokenStore {
    const store = keychainStore({ scope: 'outline', keychain: options.keychain });
    const key = new URL(options.url).host;

    return {
        async read() {
            const raw = (await store.readAll()).get(key);
            return raw == null ? null : parseStoredTokens(raw);
        },
        async write(tokens) {
            await store.write([{ key, value: JSON.stringify(tokens) }]);
        },
    };
}

/**
 * How the provider serializes a refresh with the other processes sharing the login:
 * - `acquire` takes the sync lock at `path` for the refresh;
 * - `held` means the caller already holds the sync lock for as long as it uses the provider (a sync hook),
 *   so taking it again would deadlock.
 */
export type TokenProviderLock = { kind: 'acquire'; path: string; timeoutMs?: number } | { kind: 'held' };

export interface CreateTokenProviderOptions {
    /** Base URL of the workspace. */
    url: string;
    /** The public OAuth client the login was made with. */
    clientId: string;
    store: OutlineTokenStore;
    lock: TokenProviderLock;
    fetch?: OutlineFetch;
    now?: () => number;
}

/** No usable login: nothing stored, or Outline refused the refresh token. The user has to log in again. */
export class LoginRequiredError extends Error {
    constructor(
        readonly url: string,
        readonly reason: 'missing' | 'rejected',
    ) {
        super(
            reason === 'missing'
                ? `Not logged in to Outline at ${url}`
                : `The Outline login at ${url} has expired or was revoked; log in again`,
        );
        this.name = 'LoginRequiredError';
    }
}

/**
 * A token request to Outline failed (network, server error, rate limit) or a refresh is held back after a
 * recent failure. Carries the HTTP status and the OAuth error code, never a token.
 */
export class TokenRequestError extends Error {
    constructor(
        message: string,
        readonly status?: number,
        readonly code?: string,
    ) {
        super(message);
        this.name = 'TokenRequestError';
    }
}

/**
 * Returns `getAccessToken()` for `OutlineClient`. A stored access token with more than 5 minutes left is
 * returned as is; otherwise it is refreshed under the sync lock: the refresh token is read only once the lock
 * is held (another process may have rotated it while this one waited), and the rotated tokens are written to
 * the store before the new access token is returned. Outline revokes the whole login when a used refresh token
 * comes back, so a stale one must never be sent, and a rotated one must never live only in memory.
 *
 * A failed refresh is not retried by any process for a minute; meanwhile an access token not yet expired is
 * still returned. Throws `LoginRequiredError` without tokens or once Outline refuses the refresh token.
 */
export function createTokenProvider(options: CreateTokenProviderOptions): () => Promise<string> {
    const now = options.now ?? Date.now;
    const fetchImpl = options.fetch ?? fetch;
    // Concurrent calls in this process share one refresh: under a held lock, two would send one token twice.
    let refreshing: Promise<string> | null = null;

    return getAccessToken;

    async function getAccessToken() {
        const step = nextStep(await options.store.read());
        if (step.kind === 'use') {
            return step.token;
        }
        refreshing ??= refreshUnderLock().finally(() => {
            refreshing = null;
        });
        return await refreshing;
    }

    async function refreshUnderLock() {
        const lock = options.lock;
        if (lock.kind === 'held') {
            return await refresh();
        }
        const handle = await acquireLock(lock.path, {
            timeoutMs: lock.timeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS,
        });
        if (!handle) {
            throw new TokenRequestError('Timed out waiting for the sync lock to refresh the Outline token');
        }
        try {
            return await refresh();
        } finally {
            await handle.release();
        }
    }

    /** Runs with the lock held, so what it reads is what no other process will send. */
    async function refresh() {
        const stored = await options.store.read();
        const step = nextStep(stored);
        if (step.kind === 'use') {
            return step.token;
        }
        const { tokens } = step;
        try {
            const response = await requestToken({
                url: options.url,
                fetch: fetchImpl,
                params: {
                    grant_type: 'refresh_token',
                    refresh_token: tokens.refreshToken,
                    client_id: options.clientId,
                },
            });
            const rotated: StoredOutlineTokens = {
                accessToken: response.accessToken,
                accessTokenExpiresAt: now() + response.expiresInSeconds * 1000,
                refreshToken: response.refreshToken ?? tokens.refreshToken,
            };
            await options.store.write(rotated);
            return rotated.accessToken;
        } catch (error) {
            if (!(error instanceof TokenRequestError)) {
                throw error;
            }
            const rejected = error.code === 'invalid_grant';
            await options.store.write({ ...tokens, refreshFailedAt: now(), refreshRejected: rejected });
            if (rejected) {
                throw new LoginRequiredError(options.url, 'rejected');
            }
            if (tokens.accessTokenExpiresAt > now()) {
                return tokens.accessToken;
            }
            throw error;
        }
    }

    function nextStep(stored: StoredOutlineTokens | null) {
        if (!stored) {
            throw new LoginRequiredError(options.url, 'missing');
        }
        if (stored.refreshRejected) {
            throw new LoginRequiredError(options.url, 'rejected');
        }
        const left = stored.accessTokenExpiresAt - now();
        if (left > REFRESH_MARGIN_MS) {
            return { kind: 'use', token: stored.accessToken } as const;
        }
        if (stored.refreshFailedAt != null && now() - stored.refreshFailedAt < REFRESH_BACKOFF_MS) {
            if (left > 0) {
                return { kind: 'use', token: stored.accessToken } as const;
            }
            throw new TokenRequestError('Refreshing the Outline token failed less than a minute ago; try again later');
        }
        return { kind: 'refresh', tokens: stored } as const;
    }
}

export interface RequestTokenParams {
    url: string;
    fetch: OutlineFetch;
    /** The form fields of the token request (OAuth 2.0, public client: no secret). */
    params: Record<string, string>;
}

/** A successful token response. Outline rotates the refresh token on every refresh. */
export interface TokenResponse {
    accessToken: string;
    refreshToken?: string;
    expiresInSeconds: number;
}

/**
 * POSTs a form to `<url>/oauth/token` and reads the tokens. A failure throws `TokenRequestError` with the
 * status and the OAuth error code only: the server's description may echo what was sent.
 */
export async function requestToken(options: RequestTokenParams): Promise<TokenResponse> {
    const endpoint = `${options.url.replace(/\/+$/, '')}/oauth/token`;
    let response: Response;
    try {
        response = await options.fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
            body: new URLSearchParams(options.params).toString(),
        });
    } catch (error) {
        // The tokens travel in the body, so the runtime's message (it names the URL at most) is safe to keep.
        const reason = error instanceof Error ? error.message : 'unknown error';
        throw new TokenRequestError(`Could not reach ${endpoint}: ${reason}`);
    }

    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
        const code = readField(body, 'error');
        const safeCode = code != null && /^[a-z_]+$/.test(code) ? code : undefined;
        throw new TokenRequestError(
            `Outline token request failed (${response.status}${safeCode ? `, ${safeCode}` : ''})`,
            response.status,
            safeCode,
        );
    }

    const accessToken = readField(body, 'access_token');
    const expiresIn = typeof body === 'object' && body !== null && 'expires_in' in body ? body.expires_in : null;
    if (accessToken == null || typeof expiresIn !== 'number' || !(expiresIn > 0)) {
        throw new TokenRequestError('Outline token response has no access_token or expires_in', response.status);
    }
    return { accessToken, refreshToken: readField(body, 'refresh_token'), expiresInSeconds: expiresIn };
}

function readField(body: unknown, name: string) {
    if (typeof body !== 'object' || body === null || !(name in body)) {
        return undefined;
    }
    const value: unknown = Reflect.get(body, name);
    return typeof value === 'string' && value !== '' ? value : undefined;
}

/** A malformed item counts as no login, so `login` can overwrite it. */
function parseStoredTokens(raw: string): StoredOutlineTokens | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (typeof parsed !== 'object' || parsed === null) {
        return null;
    }
    const accessToken = readField(parsed, 'accessToken');
    const refreshToken = readField(parsed, 'refreshToken');
    const expiresAt: unknown = Reflect.get(parsed, 'accessTokenExpiresAt');
    if (accessToken == null || refreshToken == null || typeof expiresAt !== 'number') {
        return null;
    }
    const failedAt: unknown = Reflect.get(parsed, 'refreshFailedAt');
    return {
        accessToken,
        accessTokenExpiresAt: expiresAt,
        refreshToken,
        refreshFailedAt: typeof failedAt === 'number' ? failedAt : undefined,
        refreshRejected: Reflect.get(parsed, 'refreshRejected') === true,
    };
}
