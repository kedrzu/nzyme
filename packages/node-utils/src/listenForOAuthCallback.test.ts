import { networkInterfaces } from 'node:os';

import { expect, test } from 'bun:test';

import { listenForOAuthCallback } from './listenForOAuthCallback.js';
import type { OAuthCallbackResult } from './listenForOAuthCallback.js';

const STATE = 'state-7Kp2';

test('resolves with the code of the callback for its state, refusing a foreign or empty one on the way', async () => {
    const port = await findFreePort();
    const listener = listenForOAuthCallback({
        redirectUri: `http://localhost:${port}/callback`,
        state: STATE,
        timeoutMs: 5000,
    });

    const foreign = await fetch(`http://127.0.0.1:${port}/callback?code=stolen&state=other`);
    expect(foreign.status).toBe(400);
    const stateless = await fetch(`http://127.0.0.1:${port}/callback?code=stolen`);
    expect(stateless.status).toBe(400);
    const empty = await fetch(`http://127.0.0.1:${port}/callback?state=${STATE}`);
    expect(empty.status).toBe(400);
    const stray = await fetch(`http://127.0.0.1:${port}/favicon.ico?state=${STATE}`);
    expect(stray.status).toBe(404);
    const answer = await fetch(`http://127.0.0.1:${port}/callback?code=abc&state=${STATE}`);
    expect(answer.status).toBe(200);

    const expected: OAuthCallbackResult = { kind: 'code', code: 'abc' };
    expect(await listener.result).toEqual(expected);
    expect(listener.redirectUri).toBe(`http://localhost:${port}/callback`);
});

test('reports a declined sign-in', async () => {
    const listener = listenForOAuthCallback({ redirectUri: 'http://127.0.0.1:0/', state: STATE, timeoutMs: 5000 });

    const declined = await fetch(`${listener.redirectUri}?error=access_denied&state=${STATE}`);
    expect(declined.status).toBe(200);

    const expected: OAuthCallbackResult = { kind: 'denied', error: 'access_denied' };
    expect(await listener.result).toEqual(expected);
});

test('port 0 listens on a free port and names it in the redirect URI', async () => {
    const listener = listenForOAuthCallback({ redirectUri: 'http://127.0.0.1:0/', state: STATE, timeoutMs: 5000 });
    const { port } = new URL(listener.redirectUri);
    expect(Number(port)).toBeGreaterThan(0);

    await fetch(`http://127.0.0.1:${port}/?code=abc&state=${STATE}`);

    expect(await listener.result).toEqual({ kind: 'code', code: 'abc' });
});

// The redirect carries an authorization code: nothing off this machine may reach the server.
test('listens on loopback only', async () => {
    const external = Object.values(networkInterfaces())
        .flat()
        .find(address => address && address.family === 'IPv4' && !address.internal);
    expect(external).toBeDefined();

    const listener = listenForOAuthCallback({ redirectUri: 'http://127.0.0.1:0/', state: STATE, timeoutMs: 1000 });
    const { port } = new URL(listener.redirectUri);

    await expect(fetch(`http://${external?.address}:${port}/?code=abc&state=${STATE}`)).rejects.toThrow();
    expect(await listener.result).toEqual({ kind: 'timeout' });
});

test('names the port and what to do when another process holds it', async () => {
    const busy = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response(null) });
    try {
        const redirectUri = `http://localhost:${busy.port}/callback`;

        expect(() => listenForOAuthCallback({ redirectUri, state: STATE, timeoutMs: 1000 })).toThrow(
            `Port ${busy.port} of the redirect URI ${redirectUri} is in use: another sign-in or app listens on it.`,
        );
    } finally {
        await busy.stop(true);
    }
});

test.each([
    'https://localhost:8760/callback',
    'http://0.0.0.0:8760/callback',
    'http://example.com:8760/callback',
    'http://localhost/callback',
    'not a url',
])('refuses the redirect URI %s before listening', redirectUri => {
    expect(() => listenForOAuthCallback({ redirectUri, state: STATE, timeoutMs: 1000 })).toThrow(
        'The redirect URI must be http://localhost:<port><path> or http://127.0.0.1:<port><path>',
    );
});

/** A port nothing listens on right now. */
async function findFreePort() {
    const probe = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response() });
    const { port } = probe;
    await probe.stop(true);
    return port;
}
