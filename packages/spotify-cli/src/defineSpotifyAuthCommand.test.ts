import { afterEach, expect, test } from 'bun:test';

import { UsageError } from '@nzyme/cli-core';
import { createMemoryStore } from '@nzyme/secrets/__fixtures__/createMemoryStore.js';
import { defineSecret } from '@nzyme/secrets/defineSecret.js';
import type { SecretStoreEntry } from '@nzyme/secrets/SecretStore.js';

import type { FakeSpotify, FakeSpotifyOptions } from './__fixtures__/fakeSpotify.js';
import { CLIENT_ID, CREDENTIALS, REFRESH_TOKEN, startFakeSpotify } from './__fixtures__/fakeSpotify.js';
import type { RunSpotifyCommandOptions, SpotifyCommandResult } from './__fixtures__/spotifyTestCli.js';
import { freeRedirectUri, runSpotifyCommand, SPOTIFY_TOKEN } from './__fixtures__/spotifyTestCli.js';
import { SPOTIFY_SCOPES } from './spotifyScopes.js';
import type { SpotifyToken } from './spotifyToken.js';
import { parseSpotifyToken } from './spotifyToken.js';

const KEY = SPOTIFY_TOKEN.name;
const fakes: FakeSpotify[] = [];

afterEach(async () => {
    const stopped = fakes.splice(0);
    await Promise.all(stopped.map(spotify => spotify.stop()));
    for (const spotify of stopped) {
        expect(spotify.violations).toEqual([]);
    }
});

test('auth signs in with PKCE and stores the token through target, printing no credential', async () => {
    const spotify = fake({ user: { id: 'ann.id', displayName: 'Ann' } });
    const other = createMemoryStore({ id: 'other' });
    const tokens = createMemoryStore({ id: 'tokens', persist: true });
    const redirectUri = await freeRedirectUri();
    const targeted: string[] = [];
    let consentUrl: URL | undefined;
    const before = Date.now();

    const result = await signIn(spotify, {
        stores: [other.store, tokens.store],
        redirectUri,
        target: key => {
            targeted.push(key);
            return tokens.store;
        },
        browser: async url => {
            consentUrl = url;
            await spotify.consent(url);
        },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(`Ann (ann.id) signed in to Spotify; its token is in ${KEY}.\n`);
    expect(result.stderr).toContain(`${spotify.endpoints.accountsUrl}/authorize?`);
    // Asked once before the browser step and again for the write.
    expect(targeted).toEqual([KEY, KEY]);
    expect(other.writes).toEqual([]);
    const token = stored(tokens.writes);
    const expected: SpotifyToken = {
        refreshToken: REFRESH_TOKEN,
        scopes: [...SPOTIFY_SCOPES],
        userId: 'ann.id',
        signedInAt: token.signedInAt,
    };
    expect(token).toEqual(expected);
    expect(Date.parse(token.signedInAt)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(token.signedInAt)).toBeLessThanOrEqual(Date.now());

    const { code_challenge: challenge, state, ...query } = Object.fromEntries(consentUrl?.searchParams ?? []);
    expect(query).toEqual({
        client_id: CLIENT_ID,
        response_type: 'code',
        redirect_uri: redirectUri,
        code_challenge_method: 'S256',
        scope: SPOTIFY_SCOPES.join(' '),
    });
    expect(challenge).toMatch(/^[\w-]{43}$/);
    expect(state).toMatch(/^[\w-]{22}$/);
    // The fake checked the verifier against the challenge before granting.
    expect(spotify.grants).toEqual(['authorization_code']);
    expect(spotify.verifiers[0]).toMatch(/^[\w-]{43,128}$/);
    expectNoCredential(spotify, result);
});

test('auth overwrites a malformed stored value', async () => {
    const spotify = fake();
    const store = createMemoryStore({ id: 'only', data: { [KEY]: 'garbage-value' }, persist: true });

    const result = await signIn(spotify, { stores: [store.store] });

    expect(result.exitCode).toBe(0);
    expect(stored(store.writes).userId).toBe('owner');
    expect(result.errors).not.toContain('garbage-value');
    expectNoCredential(spotify, result);
});

test.each<[string, Partial<RunSpotifyCommandOptions>, string]>([
    [
        'the token secret is not declared',
        { secrets: [defineSecret('OTHER_SECRET')] },
        `Refusing to write ${KEY}: it is not declared with defineSecret.`,
    ],
    [
        'the token secret is not enabled here',
        { secrets: [defineSecret(KEY, { enabled: () => false })] },
        `Refusing to write ${KEY}: it is not enabled in this environment.`,
    ],
    [
        'target refuses the key',
        {
            target: key => {
                throw new UsageError(`${key} has no store in this repo`);
            },
        },
        `${KEY} has no store in this repo`,
    ],
])('auth refuses before the browser step when %s', async (_, options, message) => {
    const spotify = fake();
    const store = createMemoryStore({ id: 'only', persist: true });
    const consented: URL[] = [];

    const result = await signIn(spotify, {
        stores: [store.store],
        browser: async url => {
            consented.push(url);
            await spotify.consent(url);
        },
        ...options,
    });

    expect(result.exitCode).toBe(1);
    expect(result.errors).toContain(message);
    expect(result.stderr).toBe('');
    expect(consented).toEqual([]);
    expect(spotify.grants).toEqual([]);
    expect(store.writes).toEqual([]);
});

test('auth ignores a redirect with the wrong state and writes nothing', async () => {
    const spotify = fake();
    const store = createMemoryStore({ id: 'only', persist: true });
    const afterForged: string[][] = [];

    const result = await signIn(spotify, {
        stores: [store.store],
        browser: async url => {
            await spotify.consent(url, { state: 'forged-state' });
            afterForged.push([...spotify.grants]);
            // Still waiting: only the person declining ends it.
            await spotify.deny(url);
        },
    });

    expect(result.exitCode).toBe(1);
    expect(result.errors).toContain('Spotify sign-in failed: access_denied');
    expect(afterForged).toEqual([[]]);
    expect(spotify.grants).toEqual([]);
    expect(store.writes).toEqual([]);
    expectNoCredential(spotify, result);
});

test('auth writes nothing when a scope was not granted', async () => {
    const spotify = fake({ scopes: SPOTIFY_SCOPES.filter(scope => scope !== 'user-follow-read') });
    const store = createMemoryStore({ id: 'only', persist: true });

    const result = await signIn(spotify, { stores: [store.store] });

    expect(result.exitCode).toBe(1);
    expect(result.errors).toContain('missing: user-follow-read');
    expect(spotify.grants).toEqual(['authorization_code']);
    expect(store.writes).toEqual([]);
    expectNoCredential(spotify, result);
});

test('auth names the port when the redirect port is taken', async () => {
    const spotify = fake();
    const store = createMemoryStore({ id: 'only', persist: true });
    const busy = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response(null) });
    try {
        const result = await signIn(spotify, {
            stores: [store.store],
            redirectUri: `http://127.0.0.1:${busy.port}/callback`,
        });

        expect(result.exitCode).toBe(1);
        expect(result.errors).toContain(`Port ${busy.port} of the redirect URI`);
        expect(result.errors).toContain('another sign-in or app');
        expect(spotify.grants).toEqual([]);
        expect(store.writes).toEqual([]);
    } finally {
        await busy.stop(true);
    }
});

function fake(options?: FakeSpotifyOptions) {
    const spotify = startFakeSpotify(options);
    fakes.push(spotify);
    return spotify;
}

/** Runs `spotify auth --no-browser` on a free redirect port, consenting in the stand-in browser. */
async function signIn(spotify: FakeSpotify, options: Omit<RunSpotifyCommandOptions, 'args' | 'endpoints'>) {
    return runSpotifyCommand({
        redirectUri: await freeRedirectUri(),
        browser: spotify.consent,
        ...options,
        args: ['spotify', 'auth', '--no-browser'],
        endpoints: spotify.endpoints,
    });
}

/** The token the last write stored. */
function stored(writes: SecretStoreEntry[][]) {
    const value = writes.at(-1)?.find(entry => entry.key === KEY)?.value;
    return parseSpotifyToken({ value, secretName: KEY, signInCommand: undefined });
}

function expectNoCredential(spotify: FakeSpotify, result: SpotifyCommandResult) {
    const output = [result.stdout, result.stderr, result.errors].join('\n');
    for (const credential of [...CREDENTIALS, ...spotify.verifiers]) {
        expect(output).not.toContain(credential);
    }
}
