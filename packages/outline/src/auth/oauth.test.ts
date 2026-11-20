import { expect, test } from 'bun:test';
import type { Server } from 'bun';
import { createHash } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createMemoryKeychain } from '@nzyme/secrets/__fixtures__/createMemoryKeychain.js';

import { LoginFailedError, login } from './oauth.js';
import { outlineTokenStore } from './tokens.js';
import type { StoredOutlineTokens } from './tokens.js';

const ACCESS_TOKEN = 'ol_at_SECRET-access';
const REFRESH_TOKEN = 'ol_rt_SECRET-refresh';
const CODE = 'auth-code-SECRET';
const NOW = 1_800_000_000_000;

test('logs in through the browser with PKCE and stores the verified tokens', async () => {
    const outline = stubOutline();
    const keychain = createMemoryKeychain();
    const store = outlineTokenStore({ url: outline.url, keychain });
    const browser = stubBrowser();

    const info = await login({
        url: outline.url,
        clientId: 'client-1',
        store,
        lockPath: await tempLockPath(),
        openBrowser: browser.open,
        now: () => NOW,
    });

    expect(info.user.name).toBe('Ana');
    const authorize = outline.authorizeParams[0];
    const redirectUri = authorize?.get('redirect_uri') ?? '';
    expect(redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
    expect(authorize?.get('response_type')).toBe('code');
    expect(authorize?.get('client_id')).toBe('client-1');
    expect(authorize?.get('scope')).toBe('read write');
    expect(authorize?.get('code_challenge_method')).toBe('S256');
    expect(authorize?.get('state')?.length).toBeGreaterThanOrEqual(16);

    // The verifier sent with the code hashes to the challenge sent to the authorize page, and no secret is sent.
    const { code_verifier: verifier = '', ...exchange } = Object.fromEntries(outline.tokenRequests[0] ?? []);
    expect(exchange).toEqual({
        grant_type: 'authorization_code',
        code: CODE,
        redirect_uri: redirectUri,
        client_id: 'client-1',
    });
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(authorize?.get('code_challenge') ?? '');

    const expected: StoredOutlineTokens = {
        accessToken: ACCESS_TOKEN,
        accessTokenExpiresAt: NOW + 3600 * 1000,
        refreshToken: REFRESH_TOKEN,
        refreshRejected: false,
    };
    expect(await store.read()).toEqual(expected);
    const [shown] = await browser.shownPages();
    expect(shown?.status).toBe(200);
    expect(shown?.text).toContain('Logged in to Outline');
});

test('a callback with a wrong state aborts the login before any code is exchanged', async () => {
    const outline = stubOutline({ callbackState: 'forged-state' });
    const keychain = createMemoryKeychain();
    const browser = stubBrowser();

    const result = login({
        url: outline.url,
        clientId: 'client-1',
        store: outlineTokenStore({ url: outline.url, keychain }),
        lockPath: await tempLockPath(),
        openBrowser: browser.open,
    });

    await expect(result).rejects.toBeInstanceOf(LoginFailedError);
    expect(outline.tokenRequests).toEqual([]);
    expect(keychain.values.size).toBe(0);
    const [shown] = await browser.shownPages();
    expect(shown?.status).toBe(400);
    expect(shown?.text).toContain('Login aborted');
});

test('gives up when the browser never comes back, and frees the port', async () => {
    const outline = stubOutline();
    let callback = '';

    const result = login({
        url: outline.url,
        clientId: 'client-1',
        store: outlineTokenStore({ url: outline.url, keychain: createMemoryKeychain() }),
        lockPath: await tempLockPath(),
        openBrowser: url => {
            callback = new URL(url).searchParams.get('redirect_uri') ?? '';
            return Promise.resolve();
        },
        timeoutMs: 50,
    });

    await expect(result).rejects.toThrow('Timed out waiting for the browser');
    expect(callback).not.toBe('');
    await expect(fetch(callback)).rejects.toThrow();
});

test('a failed token exchange stores nothing and its error carries neither the code nor the verifier', async () => {
    const outline = stubOutline({ tokenFailure: true });
    const keychain = createMemoryKeychain();
    const browser = stubBrowser();

    const error = await login({
        url: outline.url,
        clientId: 'client-1',
        store: outlineTokenStore({ url: outline.url, keychain }),
        lockPath: await tempLockPath(),
        openBrowser: browser.open,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    const message = error instanceof Error ? `${error.message} ${error.stack ?? ''}` : '';
    expect(message).toContain('invalid_grant');
    expect(message).not.toContain(CODE);
    expect(message).not.toContain(outline.tokenRequests[0]?.get('code_verifier') ?? 'unset');
    expect(keychain.values.size).toBe(0);
    expect((await browser.shownPages())[0]?.status).toBe(500);
});

interface StubOutlineOptions {
    /** Sent back to the callback instead of the state the authorize request carried. */
    callbackState?: string;
    /** The token endpoint refuses the code and echoes what it got in the description. */
    tokenFailure?: boolean;
}

/** Outline's authorize page (approving at once), token endpoint and `auth.info`, on a real loopback socket. */
function stubOutline(options: StubOutlineOptions = {}) {
    const authorizeParams: URLSearchParams[] = [];
    const tokenRequests: URLSearchParams[] = [];
    const server: Server<undefined> = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        async fetch(request) {
            const url = new URL(request.url);
            switch (url.pathname) {
                case '/oauth/authorize': {
                    authorizeParams.push(url.searchParams);
                    const callback = new URL(url.searchParams.get('redirect_uri') ?? '');
                    callback.searchParams.set('code', CODE);
                    callback.searchParams.set('state', options.callbackState ?? url.searchParams.get('state') ?? '');
                    return Response.redirect(callback.toString(), 302);
                }
                case '/oauth/token': {
                    const form = new URLSearchParams(await request.text());
                    tokenRequests.push(form);
                    if (options.tokenFailure) {
                        return Response.json(
                            { error: 'invalid_grant', error_description: `bad ${form.toString()}` },
                            { status: 400 },
                        );
                    }
                    return Response.json({
                        access_token: ACCESS_TOKEN,
                        refresh_token: REFRESH_TOKEN,
                        expires_in: 3600,
                        token_type: 'Bearer',
                        scope: 'read write',
                    });
                }
                case '/api/auth.info':
                    if (request.headers.get('Authorization') !== `Bearer ${ACCESS_TOKEN}`) {
                        return Response.json({ ok: false, error: 'authentication_required' }, { status: 401 });
                    }
                    return Response.json({
                        data: { user: { id: 'u1', name: 'Ana' }, team: { id: 't1', name: 'Healed' } },
                    });
                default:
                    return new Response('Not found', { status: 404 });
            }
        },
    });
    return { url: `http://127.0.0.1:${server.port}`, authorizeParams, tokenRequests };
}

/**
 * Follows the authorize URL and its redirect to the callback like a browser, keeping the page it ends on.
 * `open` returns at once, as macOS `open` does; `shownPages()` waits for the pages.
 */
function stubBrowser() {
    const visits: Promise<{ status: number; text: string }>[] = [];
    return { open, shownPages: () => Promise.all(visits) };

    function open(url: string) {
        visits.push(fetch(url).then(async response => ({ status: response.status, text: await response.text() })));
        return Promise.resolve();
    }
}

async function tempLockPath() {
    return join(await mkdtemp(join(tmpdir(), 'outline-login-')), 'lock');
}
