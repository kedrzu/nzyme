import { expect, test } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Keychain } from '@nzyme/secrets/osKeychain.js';

import { acquireLock, tryAcquireLock } from '../state/lock.js';
import { LoginRequiredError, TokenRequestError, createTokenProvider, outlineTokenStore } from './tokens.js';
import type { OutlineTokenStore, StoredOutlineTokens, TokenProviderLock } from './tokens.js';

const NOW = 1_800_000_000_000;
const MINUTE = 60 * 1000;

test('an access token with more than 5 minutes left is used without a token request', async () => {
    const outline = stubTokenEndpoint();
    const store = memoryStore(outline.url);
    await store.write(tokens({ access: 'ol_at_1', refresh: 'ol_rt_1', expiresAt: NOW + 6 * MINUTE }));

    const getAccessToken = provider({ url: outline.url, store, lock: await acquireMode() });

    expect(await getAccessToken()).toBe('ol_at_1');
    expect(outline.requests).toEqual([]);
});

test('a token close to expiry is refreshed under the lock and the rotated tokens are stored', async () => {
    const outline = stubTokenEndpoint();
    const store = memoryStore(outline.url);
    await store.write(tokens({ access: 'ol_at_1', refresh: 'ol_rt_1', expiresAt: NOW + 4 * MINUTE }));
    const lock = await acquireMode();

    const token = await provider({ url: outline.url, store, lock })();

    expect(token).toBe('ol_at_2');
    expect(outline.requests).toEqual([
        { grant_type: 'refresh_token', refresh_token: 'ol_rt_1', client_id: 'client-1' },
    ]);
    const expected: StoredOutlineTokens = tokens({
        access: 'ol_at_2',
        refresh: 'ol_rt_2',
        expiresAt: NOW + 60 * MINUTE,
    });
    expect(await store.read()).toEqual(expected);
    // The lock was released.
    const again = await tryAcquireLock(lock.path);
    expect(again).not.toBeNull();
    await again?.release();
});

test('the refresh token is read only once the lock is held, so one rotated meanwhile is not replayed', async () => {
    const outline = stubTokenEndpoint();
    const store = memoryStore(outline.url);
    await store.write(tokens({ access: 'ol_at_1', refresh: 'ol_rt_1', expiresAt: NOW + MINUTE }));
    const lock = await acquireMode();
    const otherProcess = await acquireLock(lock.path, { timeoutMs: 1000 });

    const pending = provider({ url: outline.url, store, lock })();
    await Bun.sleep(250);
    // Another process rotated the refresh token while this one waited for the lock (its access token is short too).
    await store.write(tokens({ access: 'ol_at_5', refresh: 'ol_rt_5', expiresAt: NOW + MINUTE }));
    expect(outline.requests).toEqual([]);
    await otherProcess?.release();

    expect(await pending).toBe('ol_at_2');
    expect(outline.requests.map(request => request.refresh_token)).toEqual(['ol_rt_5']);
});

test('a process that waited for the lock uses the token another process refreshed, without a request', async () => {
    const outline = stubTokenEndpoint();
    const store = memoryStore(outline.url);
    await store.write(tokens({ access: 'ol_at_1', refresh: 'ol_rt_1', expiresAt: NOW + MINUTE }));
    const lock = await acquireMode();
    const otherProcess = await acquireLock(lock.path, { timeoutMs: 1000 });

    const pending = provider({ url: outline.url, store, lock })();
    await Bun.sleep(250);
    await store.write(tokens({ access: 'ol_at_9', refresh: 'ol_rt_9', expiresAt: NOW + 60 * MINUTE }));
    await otherProcess?.release();

    expect(await pending).toBe('ol_at_9');
    expect(outline.requests).toEqual([]);
});

test('with the lock held by the caller, concurrent calls share one refresh', async () => {
    const outline = stubTokenEndpoint();
    const store = memoryStore(outline.url);
    await store.write(tokens({ access: 'ol_at_1', refresh: 'ol_rt_1', expiresAt: NOW + MINUTE }));
    const getAccessToken = provider({ url: outline.url, store, lock: { kind: 'held' } });

    const results = await Promise.all([getAccessToken(), getAccessToken(), getAccessToken()]);

    expect(results).toEqual(['ol_at_2', 'ol_at_2', 'ol_at_2']);
    expect(outline.requests.map(request => request.refresh_token)).toEqual(['ol_rt_1']);
});

test('a rotated token that cannot be stored is never handed out', async () => {
    const outline = stubTokenEndpoint();
    const keychain = memoryKeychain();
    const store = outlineTokenStore({ url: outline.url, keychain });
    await store.write(tokens({ access: 'ol_at_1', refresh: 'ol_rt_1', expiresAt: NOW - MINUTE }));
    keychain.failWrites = true;

    const result = provider({ url: outline.url, store, lock: { kind: 'held' } })();

    await expect(result).rejects.toThrow('keychain is locked');
    expect(outline.requests).toHaveLength(1);
});

test('a refused refresh token requires a new login, also in other processes, without more requests', async () => {
    const outline = stubTokenEndpoint(form =>
        Response.json(
            { error: 'invalid_grant', error_description: `token ${form.get('refresh_token')} was revoked` },
            { status: 400 },
        ),
    );
    const store = memoryStore(outline.url);
    await store.write(tokens({ access: 'ol_at_1', refresh: 'ol_rt_SECRET', expiresAt: NOW + MINUTE }));

    const error = await provider({ url: outline.url, store, lock: { kind: 'held' } })().catch(
        (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(LoginRequiredError);
    expect(error).toMatchObject({ reason: 'rejected' });
    expect(error instanceof Error ? `${error.message} ${error.stack ?? ''}` : '').not.toContain('ol_rt_SECRET');
    const otherProcess = provider({ url: outline.url, store, lock: { kind: 'held' } });
    await expect(otherProcess()).rejects.toBeInstanceOf(LoginRequiredError);
    expect(outline.requests).toHaveLength(1);
});

test('without stored tokens a login is required', async () => {
    const outline = stubTokenEndpoint();

    const result = provider({ url: outline.url, store: memoryStore(outline.url), lock: { kind: 'held' } })();

    await expect(result).rejects.toMatchObject({ name: 'LoginRequiredError', reason: 'missing' });
});

test('after a failed refresh no process retries for a minute, and the error carries no token', async () => {
    let fail = true;
    const outline = stubTokenEndpoint(form =>
        fail
            ? Response.json({ error: 'server_error', error_description: form.toString() }, { status: 500 })
            : undefined,
    );
    const store = memoryStore(outline.url);
    await store.write(tokens({ access: 'ol_at_1', refresh: 'ol_rt_SECRET', expiresAt: NOW - MINUTE }));
    let now = NOW;
    const options = { url: outline.url, store, lock: { kind: 'held' } as const, now: () => now };

    const first = await provider(options)().catch((caught: unknown) => caught);
    expect(first).toBeInstanceOf(TokenRequestError);
    expect(first instanceof Error ? `${first.message} ${first.stack ?? ''}` : '').not.toContain('ol_rt_SECRET');

    now = NOW + 30 * 1000;
    fail = false;
    await expect(provider(options)()).rejects.toBeInstanceOf(TokenRequestError);
    expect(outline.requests).toHaveLength(1);

    now = NOW + 61 * 1000;
    expect(await provider(options)()).toBe('ol_at_2');
    expect(outline.requests).toHaveLength(2);
});

test('while a refresh fails, an access token that has not expired yet is still used', async () => {
    const outline = stubTokenEndpoint(() => Response.json({ error: 'server_error' }, { status: 503 }));
    const store = memoryStore(outline.url);
    await store.write(tokens({ access: 'ol_at_1', refresh: 'ol_rt_1', expiresAt: NOW + 2 * MINUTE }));

    const token = await provider({ url: outline.url, store, lock: { kind: 'held' } })();

    expect(token).toBe('ol_at_1');
    expect(outline.requests).toHaveLength(1);
});

interface ProviderOptions {
    url: string;
    store: OutlineTokenStore;
    lock: TokenProviderLock;
    now?: () => number;
}

function provider(options: ProviderOptions) {
    return createTokenProvider({ clientId: 'client-1', now: () => NOW, ...options });
}

async function acquireMode() {
    const path = join(await mkdtemp(join(tmpdir(), 'outline-tokens-')), 'lock');
    return { kind: 'acquire', path, timeoutMs: 5000 } as const;
}

function tokens(values: { access: string; refresh: string; expiresAt: number }): StoredOutlineTokens {
    return {
        accessToken: values.access,
        accessTokenExpiresAt: values.expiresAt,
        refreshToken: values.refresh,
        refreshRejected: false,
    };
}

/**
 * Outline's token endpoint on a real loopback socket. By default it rotates: `ol_rt_N` → `ol_at_2`/`ol_rt_2`;
 * `respond` may answer instead (returning `undefined` falls back to the default).
 */
function stubTokenEndpoint(respond?: (form: URLSearchParams) => Response | undefined) {
    const requests: Record<string, string>[] = [];
    const server = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        async fetch(request) {
            if (new URL(request.url).pathname !== '/oauth/token') {
                return new Response('Not found', { status: 404 });
            }
            const form = new URLSearchParams(await request.text());
            requests.push(Object.fromEntries(form));
            return (
                respond?.(form) ??
                Response.json({
                    access_token: 'ol_at_2',
                    refresh_token: 'ol_rt_2',
                    expires_in: 3600,
                    token_type: 'Bearer',
                    scope: 'read write',
                })
            );
        },
    });
    return { url: `http://127.0.0.1:${server.port}`, requests };
}

function memoryStore(url: string) {
    return outlineTokenStore({ url, keychain: memoryKeychain() });
}

function memoryKeychain(): Keychain & { failWrites: boolean } {
    const values = new Map<string, string>();
    const keychain = {
        failWrites: false,
        get: (name: string) => Promise.resolve(values.get(name) ?? null),
        set: (name: string, value: string) => {
            if (keychain.failWrites) {
                return Promise.reject(new Error('keychain is locked'));
            }
            values.set(name, value);
            return Promise.resolve();
        },
        delete: (name: string) => Promise.resolve(values.delete(name)),
    };
    return keychain;
}
