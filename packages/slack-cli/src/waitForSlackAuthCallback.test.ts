import { networkInterfaces } from 'node:os';

import { expect, test } from 'bun:test';

import { waitForSlackAuthCallback } from './waitForSlackAuthCallback.js';

const STATE = 'state-7Kp2';

test('resolves with the code of the callback for its state, refusing a foreign one on the way', async () => {
    const port = await findFreePort();
    const wait = waitForSlackAuthCallback({
        redirectUri: `http://localhost:${port}/callback`,
        state: STATE,
        timeoutMs: 5000,
    });

    const foreign = await fetch(`http://127.0.0.1:${port}/callback?code=stolen&state=other`);
    expect(foreign.status).toBe(400);
    const stray = await fetch(`http://127.0.0.1:${port}/favicon.ico`);
    expect(stray.status).toBe(404);
    const answer = await fetch(`http://127.0.0.1:${port}/callback?code=abc&state=${STATE}`);
    expect(answer.status).toBe(200);

    expect(await wait).toEqual({ kind: 'code', code: 'abc' });
});

// The redirect carries an authorization code: nothing off this machine may reach the server.
test('listens on loopback only', async () => {
    const external = Object.values(networkInterfaces())
        .flat()
        .find(address => address && address.family === 'IPv4' && !address.internal);
    expect(external).toBeDefined();

    const port = await findFreePort();
    const wait = waitForSlackAuthCallback({
        redirectUri: `http://localhost:${port}/callback`,
        state: STATE,
        timeoutMs: 1000,
    });

    await expect(fetch(`http://${external?.address}:${port}/callback?code=abc&state=${STATE}`)).rejects.toThrow();
    expect(await wait).toEqual({ kind: 'timeout' });
});

test('refuses a redirect URI off localhost before listening', async () => {
    await expect(
        waitForSlackAuthCallback({ redirectUri: 'http://0.0.0.0:8760/callback', state: STATE, timeoutMs: 1000 }),
    ).rejects.toThrow('The Slack redirect URI must be http://localhost:<port><path>');
});

/** A port nothing listens on right now. */
async function findFreePort() {
    const probe = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response() });
    const { port } = probe;
    await probe.stop(true);
    return port;
}
