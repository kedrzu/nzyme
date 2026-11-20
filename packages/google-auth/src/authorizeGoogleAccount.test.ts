import { afterEach, expect, test } from 'bun:test';

import { createMemoryStore } from '@nzyme/secrets/__fixtures__/createMemoryStore.js';

import type { FakeGoogleOptions, GoogleCommandResult } from './__fixtures__/googleTestCli.js';
import {
    ACCESS_TOKEN,
    CLIENT,
    CLIENT_KEYS,
    CREDENTIALS,
    GMAIL_TOKENS,
    grantConsent,
    OTHER_CLIENT,
    REFRESH_TOKEN,
    runGoogleCommand,
    SCOPES,
    startFakeGoogle,
    TEST_SERVICE,
    tokensValue,
} from './__fixtures__/googleTestCli.js';
import { authorizeGoogle } from './authorizeGoogle.js';
import { parseGoogleTokens } from './googleTokens.js';
import type { GoogleTokenStorage } from './GoogleTokenStorage.js';
import { saveGoogleToken } from './saveGoogleToken.js';
import { signInGoogle } from './signInGoogle.js';

const KEY = GMAIL_TOKENS.name;
const fakes: ReturnType<typeof startFakeGoogle>[] = [];

afterEach(async () => {
    await Promise.all(fakes.splice(0).map(google => google.stop()));
});

test.each([
    ['not allowed', 'bob@home.com', 'bob@home.com is not in the accounts this project allows'],
    ['without a token', 'eve@work.com', '`nzyme gmail auth --login-hint eve@work.com`'],
])('an account %s is refused by name before any call to Google', async (_, account, reason) => {
    const google = fake({ email: account });
    const store = createMemoryStore({ id: 'only', data: { ...CLIENT_KEYS, [KEY]: tokensValue('bob@home.com') } });

    const result = await runGoogleCommand({
        args: ['gmail', 'whoami', '--account', account],
        stores: [store.store],
        endpoints: google.endpoints,
        accounts: ['*@work.com'],
    });

    expect(result.exitCode).toBe(1);
    expect(result.errors).toContain(reason);
    expect(google.grants).toEqual([]);
});

test('without --account several usable accounts are listed, and a single one is used', async () => {
    const google = fake({ email: 'me@example.com' });
    const two = createMemoryStore({
        id: 'two',
        data: { ...CLIENT_KEYS, [KEY]: tokensValue('you@x.com', 'me@example.com', 'no@other.com') },
    });
    const one = createMemoryStore({
        id: 'one',
        data: { ...CLIENT_KEYS, [KEY]: tokensValue('me@example.com', 'no@other.com') },
    });
    const accounts = ['*@example.com', '*@x.com'];

    const several = await runGoogleCommand({
        args: ['gmail', 'whoami'],
        stores: [two.store],
        endpoints: google.endpoints,
        accounts,
    });
    const single = await runGoogleCommand({
        args: ['gmail', 'whoami'],
        stores: [one.store],
        endpoints: google.endpoints,
        accounts,
    });

    expect(several.exitCode).toBe(1);
    expect(several.errors).toContain('choose one with --account: me@example.com, you@x.com.');
    expect(single).toMatchObject({ exitCode: 0, stdout: 'me@example.com\n' });
});

test('a command fails naming the token secret when it is not a token dictionary', async () => {
    const google = fake({ email: 'me@example.com' });
    const store = createMemoryStore({
        id: 'only',
        data: { ...CLIENT_KEYS, [KEY]: `{"me@example.com":"${REFRESH_TOKEN}"}` },
    });

    const result = await runGoogleCommand({
        args: ['gmail', 'whoami'],
        stores: [store.store],
        endpoints: google.endpoints,
    });

    expect(result.exitCode).toBe(1);
    expect(result.errors).toContain(`${KEY} does not hold Google tokens`);
    expect(google.grants).toEqual([]);
    expectNoCredential(result);
});

test('a revoked refresh token fails with the sign-in command and stays in place', async () => {
    const google = fake({ email: 'me@example.com', revoked: [REFRESH_TOKEN] });
    const store = createMemoryStore({ id: 'only', data: { ...CLIENT_KEYS, [KEY]: tokensValue('me@example.com') } });

    const result = await runGoogleCommand({
        args: ['gmail', 'whoami'],
        stores: [store.store],
        endpoints: google.endpoints,
    });

    expect(result.exitCode).toBe(1);
    expect(result.errors).toContain('`nzyme gmail auth --login-hint me@example.com`');
    expect(google.grants).toEqual(['refresh_token']);
    expect(store.writes).toEqual([]);
    expectNoCredential(result);
});

test('a missing OAuth client fails before any call to Google and leaves the token in place', async () => {
    const google = fake({ email: 'me@example.com' });
    const store = createMemoryStore({
        id: 'only',
        data: { GOOGLE_CLIENT_ID: CLIENT_KEYS.GOOGLE_CLIENT_ID, [KEY]: tokensValue('me@example.com') },
    });

    const result = await runGoogleCommand({
        args: ['gmail', 'whoami'],
        stores: [store.store],
        endpoints: google.endpoints,
    });

    expect(result.exitCode).toBe(1);
    expect(result.errors).toContain('GOOGLE_CLIENT_SECRET');
    expect(google.grants).toEqual([]);
    expect(store.writes).toEqual([]);
    expectNoCredential(result);
});

test('without a container, two accounts sign in and refresh each with its own OAuth client', async () => {
    const storage = memoryStorage();
    const accounts = [
        { email: 'ann@example.com', credentials: CLIENT },
        { email: 'bob@example.com', credentials: OTHER_CLIENT },
    ];

    for (const { email, credentials } of accounts) {
        const google = fake({ email, clients: [credentials] });
        const printed = Promise.withResolvers<string>();
        const signedIn = signInGoogle({
            credentials,
            tokenUrl: google.endpoints.oauthTokenUrl,
            service: TEST_SERVICE,
            apiRootUrl: google.endpoints.apiRootUrl,
            openBrowser: false,
            print: printed.resolve,
        });
        // The printed message ends with the sign-in URL.
        await grantConsent(new URL((await printed.promise).split('\n').at(-1) ?? ''));
        await saveGoogleToken({ storage, secretName: KEY, token: await signedIn, allowed: undefined });
    }

    // One token endpoint serving both clients, as Google does: each refresh must carry the account's own.
    const google = fake({ email: 'unused@example.com', clients: [CLIENT, OTHER_CLIENT] });
    const stored = parseGoogleTokens(await storage.read(), KEY);
    expect([...stored.keys()]).toEqual(['ann@example.com', 'bob@example.com']);
    expect(stored.get('bob@example.com')).toEqual({ refreshToken: REFRESH_TOKEN, scopes: SCOPES });

    for (const { email, credentials } of accounts) {
        const auth = await authorizeGoogle({
            credentials,
            email,
            refreshToken: REFRESH_TOKEN,
            tokenUrl: google.endpoints.oauthTokenUrl,
            signInCommand: 'nzyme gmail auth',
        });
        expect(auth.credentials.access_token).toBe(ACCESS_TOKEN);
    }

    expect(google.refreshes.map(refresh => refresh.clientId)).toEqual([CLIENT.clientId, OTHER_CLIENT.clientId]);
});

function fake(options: FakeGoogleOptions) {
    const google = startFakeGoogle(options);
    fakes.push(google);
    return google;
}

/** A token storage in memory: no secret store, no container. */
function memoryStorage(): GoogleTokenStorage {
    let stored: string | undefined;
    return {
        read: () => Promise.resolve(stored),
        write(value) {
            stored = value;
            return Promise.resolve();
        },
    };
}

function expectNoCredential(result: GoogleCommandResult) {
    const output = [result.stdout, result.stderr, result.errors].join('\n');
    for (const credential of CREDENTIALS) {
        expect(output).not.toContain(credential);
    }
}
