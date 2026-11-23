import { afterEach, expect, test } from 'bun:test';

import { CommandScope } from '@nzyme/cli-core/Command.js';
import { createContainer } from '@nzyme/ioc/Container.js';
import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import { createMemoryStore } from '@nzyme/secrets/__fixtures__/createMemoryStore.js';
import type { SecretStore, SecretStoreEntry } from '@nzyme/secrets/SecretStore.js';

import type { FakeSpotify, FakeSpotifyOptions } from './__fixtures__/fakeSpotify.js';
import {
    ACCESS_TOKEN,
    apiError,
    CREDENTIALS,
    REFRESH_TOKEN,
    ROTATED_REFRESH_TOKEN,
    startFakeSpotify,
} from './__fixtures__/fakeSpotify.js';
import type { SpotifyCommandResult } from './__fixtures__/spotifyTestCli.js';
import {
    runSpotifyCommand,
    SPOTIFY_TOKEN,
    testSpotifyOptions,
    testToken,
    testTokenValue,
} from './__fixtures__/spotifyTestCli.js';
import { defineSpotify } from './defineSpotify.js';
import { SpotifyEndpoints } from './SpotifyEndpoints.js';
import { parseSpotifyToken } from './spotifyToken.js';

const KEY = SPOTIFY_TOKEN.name;
const SIGN_IN_AGAIN = 'Sign in again with `nzyme spotify auth`.';
const fakes: FakeSpotify[] = [];

afterEach(async () => {
    const stopped = fakes.splice(0);
    await Promise.all(stopped.map(spotify => spotify.stop()));
    for (const spotify of stopped) {
        expect(spotify.violations).toEqual([]);
    }
});

test.each<['none' | 'same']>([['none'], ['same']])(
    'a command refreshes once and rewrites nothing when the refresh returns %s refresh token',
    async refreshReturns => {
        const spotify = fake({ refreshReturns });
        const store = createMemoryStore({ id: 'only', data: { [KEY]: testTokenValue() }, persist: true });

        const result = await whoami(spotify, store.store);

        expect(result).toMatchObject({ exitCode: 0, stdout: 'owner\n' });
        expect(spotify.refreshes).toEqual([REFRESH_TOKEN]);
        expect(store.writes).toEqual([]);
        expectNoCredential(result);
    },
);

test('a rotated refresh token is stored, the rest of the token kept', async () => {
    const spotify = fake({ refreshReturns: 'rotated' });
    const store = createMemoryStore({ id: 'only', data: { [KEY]: testTokenValue() }, persist: true });

    const result = await whoami(spotify, store.store);

    expect(result.exitCode).toBe(0);
    expect(store.writes.length).toBe(1);
    expect(storedToken(store.writes)).toEqual(testToken({ refreshToken: ROTATED_REFRESH_TOKEN }));

    // The next run refreshes with the rotated token.
    const next = await whoami(spotify, store.store);
    expect(next.exitCode).toBe(0);
    expect(spotify.refreshes).toEqual([REFRESH_TOKEN, ROTATED_REFRESH_TOKEN]);
    expectNoCredential(result);
});

test.each<[string, Record<string, string>, FakeSpotifyOptions, string]>([
    ['no token is stored', {}, {}, `No Spotify account is signed in: ${KEY} is empty.`],
    ['the stored token is malformed', { [KEY]: 'garbage-value' }, {}, `${KEY} does not hold a Spotify token`],
    [
        'the stored token lacks a field',
        { [KEY]: JSON.stringify({ refreshToken: REFRESH_TOKEN, scopes: [] }) },
        {},
        `${KEY} does not hold a Spotify token`,
    ],
    [
        'Spotify rejects the refresh token (invalid_grant)',
        { [KEY]: testTokenValue() },
        { revoked: [REFRESH_TOKEN] },
        'Spotify rejected the stored refresh token',
    ],
    [
        'the API answers 403 for an insufficient scope',
        { [KEY]: testTokenValue() },
        { api: () => apiError(403, 'Insufficient client scope') },
        'lacks a permission this call needs',
    ],
    [
        'the API answers 401',
        { [KEY]: testTokenValue() },
        { api: () => apiError(401, 'The access token expired') },
        'Spotify refused the access token (HTTP 401).',
    ],
])('a command asks to sign in again when %s', async (_, data, options, reason) => {
    const spotify = fake(options);
    const store = createMemoryStore({ id: 'only', data });

    const result = await whoami(spotify, store.store);

    expect(result.exitCode).toBe(1);
    expect(result.errors).toContain(reason);
    expect(result.errors).toContain(SIGN_IN_AGAIN);
    expect(result.errors).not.toContain('garbage-value');
    expect(store.writes).toEqual([]);
    expectNoCredential(result);
});

test('another 403 reaches the command as a status, not a sign-in error', async () => {
    const spotify = fake({ api: () => apiError(403, 'You cannot add to a playlist you do not own') });
    const store = createMemoryStore({ id: 'only', data: { [KEY]: testTokenValue() } });

    const result = await whoami(spotify, store.store);

    expect(result.exitCode).toBe(1);
    expect(result.errors).toContain('Spotify profile read failed with HTTP 403.');
    expect(result.errors).not.toContain('Sign in again');
    expect(result.errors).not.toContain('playlist you do not own');
});

test('a short 429 is waited out and retried at most twice', async () => {
    const twice = fake({ rateLimits: [{ retryAfter: 0 }, { retryAfter: 0 }] });
    const store = createMemoryStore({ id: 'only', data: { [KEY]: testTokenValue() } });

    const passed = await whoami(twice, store.store);

    expect(passed).toMatchObject({ exitCode: 0, stdout: 'owner\n' });
    expect(twice.requests.map(request => request.path)).toEqual(['/me', '/me', '/me']);

    const thrice = fake({ rateLimits: [{ retryAfter: 0 }, { retryAfter: 0 }, { retryAfter: 0 }] });
    const failed = await whoami(thrice, store.store);

    expect(failed.exitCode).toBe(1);
    expect(failed.errors).toContain('Spotify rate-limited the GET /v1/me (HTTP 429), asking to wait 0 s.');
    expect(thrice.requests.length).toBe(3);
});

test('a long 429 fails at once, naming the wait and the reason but not the body', async () => {
    const spotify = fake({ rateLimits: [{ retryAfter: 3600, reason: 'QUOTA_EXCEEDED' }] });
    const store = createMemoryStore({ id: 'only', data: { [KEY]: testTokenValue() } });

    const result = await whoami(spotify, store.store);

    expect(result.exitCode).toBe(1);
    expect(result.errors).toContain(
        'Spotify rate-limited the GET /v1/me (HTTP 429), asking to wait 3600 s; reason: QUOTA_EXCEEDED.',
    );
    expect(result.errors).not.toContain('API rate limit exceeded');
    expect(spotify.requests.length).toBe(1);
    expectNoCredential(result);
});

test('a program resolves it in a command scope: one refresh per scope, a generic sign-in pointer', async () => {
    const spotify = fake();
    const store = createMemoryStore({ id: 'only', data: { [KEY]: testTokenValue() } });
    const unit = defineSpotify(testSpotifyOptions({ stores: [store.store] }));
    const container = createContainer();
    container.set(EnvVariables, {});
    container.set(SpotifyEndpoints, spotify.endpoints);

    const scope = container.createChild(CommandScope);
    const service = scope.resolve(unit);
    const api = await service.getApi();
    const result = await api({ method: 'GET', path: '/me' });

    expect(result.status).toBe(200);
    expect(await service.getAccessToken()).toBe(ACCESS_TOKEN);
    expect(spotify.refreshes).toEqual([REFRESH_TOKEN]);

    await container.createChild(CommandScope).resolve(unit).getApi();
    expect(spotify.refreshes).toEqual([REFRESH_TOKEN, REFRESH_TOKEN]);

    const empty = createMemoryStore({ id: 'empty' });
    const unsigned = defineSpotify(testSpotifyOptions({ stores: [empty.store] }));
    await expect(container.createChild(CommandScope).resolve(unsigned).getApi()).rejects.toThrow(
        'Sign in again with the `auth` command of the Spotify CLI.',
    );
});

function fake(options?: FakeSpotifyOptions) {
    const spotify = startFakeSpotify(options);
    fakes.push(spotify);
    return spotify;
}

function whoami(spotify: FakeSpotify, store: SecretStore) {
    return runSpotifyCommand({ args: ['spotify', 'whoami'], stores: [store], endpoints: spotify.endpoints });
}

function storedToken(writes: SecretStoreEntry[][]) {
    const value = writes.at(-1)?.find(entry => entry.key === KEY)?.value;
    return parseSpotifyToken({ value, secretName: KEY, signInCommand: undefined });
}

function expectNoCredential(result: SpotifyCommandResult) {
    const output = [result.stdout, result.stderr, result.errors].join('\n');
    for (const credential of CREDENTIALS) {
        expect(output).not.toContain(credential);
    }
}
