import fs from 'node:fs/promises';
import path from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { UsageError } from '@nzyme/cli-core';
import { createMemoryStore } from '@nzyme/secrets/__fixtures__/createMemoryStore.js';
import { defineSecret } from '@nzyme/secrets/defineSecret.js';
import type { SecretStoreEntry } from '@nzyme/secrets/SecretStore.js';

import type { GoogleCommandResult, RunGoogleCommandOptions } from './__fixtures__/googleTestCli.js';
import {
    CLIENT_ID,
    CLIENT_KEYS,
    CREDENTIALS,
    GMAIL_TOKENS,
    grantConsent,
    REFRESH_TOKEN,
    runGoogleCommand,
    SCOPES,
    startFakeGoogle,
    tokensValue,
} from './__fixtures__/googleTestCli.js';
import { parseGoogleTokens } from './googleTokens.js';

const KEY = GMAIL_TOKENS.name;
const fakes: ReturnType<typeof startFakeGoogle>[] = [];

afterEach(async () => {
    await Promise.all(fakes.splice(0).map(google => google.stop()));
});

test('auth writes the declared token secret through target and accounts reads it back, printing no credential', async () => {
    const google = fake('me@example.com');
    const client = createMemoryStore({ id: 'client', data: CLIENT_KEYS });
    const tokens = createMemoryStore({ id: 'tokens', persist: true });
    const stores = [client.store, tokens.store];
    const targeted: string[] = [];
    let consentUrl: URL | undefined;

    const auth = await signIn(google, {
        args: ['gmail', 'auth', '--no-browser', '--login-hint', 'me@example.com'],
        stores,
        secrets: [GMAIL_TOKENS],
        target: key => {
            targeted.push(key);
            return tokens.store;
        },
        browser: async url => {
            consentUrl = url;
            await grantConsent(url);
        },
    });

    expect(auth.exitCode).toBe(0);
    expect(auth.stdout).toBe(`me@example.com signed in to GMAIL; its token is in ${KEY}.\n`);
    // Asked once before the browser step and again for the write.
    expect(targeted).toEqual([KEY, KEY]);
    expect(client.writes).toEqual([]);
    expect(tokens.writes.map(write => write.map(entry => entry.key))).toEqual([[KEY]]);
    expect(stored(tokens.writes)).toEqual({ 'me@example.com': { refreshToken: REFRESH_TOKEN, scopes: SCOPES } });
    expect(consentUrl?.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(consentUrl?.searchParams.get('login_hint')).toBe('me@example.com');
    expect(consentUrl?.searchParams.get('scope')).toBe(SCOPES.join(' '));
    expect(consentUrl?.searchParams.get('access_type')).toBe('offline');
    expect(consentUrl?.searchParams.get('code_challenge_method')).toBe('S256');

    const accounts = await runGoogleCommand({ args: ['gmail', 'accounts'], stores, endpoints: google.endpoints });

    expect(accounts.exitCode).toBe(0);
    expect(accounts.stdout).toBe(`me@example.com\t${SCOPES.join(' ')}\n`);
    expectNoCredential(auth);
    expectNoCredential(accounts);
});

test('signing in a second account keeps the first, and commands act as either', async () => {
    const store = createMemoryStore({ id: 'only', data: CLIENT_KEYS, persist: true });
    const stores = [store.store];

    const first = await signIn(fake('Ann@Example.com'), { args: ['gmail', 'auth', '--no-browser'], stores });
    const second = await signIn(fake('bob@example.com'), { args: ['gmail', 'auth', '--no-browser'], stores });

    expect([first.exitCode, second.exitCode]).toEqual([0, 0]);
    expect(Object.keys(stored(store.writes))).toEqual(['ann@example.com', 'bob@example.com']);

    for (const email of ['ann@example.com', 'bob@example.com']) {
        const google = fake(email);
        const whoami = await runGoogleCommand({
            args: ['gmail', 'whoami', '--account', email],
            stores,
            endpoints: google.endpoints,
        });
        expect(whoami).toMatchObject({ exitCode: 0, stdout: `${email}\n` });
    }
});

test('auth reads the token secret again after the browser step, keeping an account signed in meanwhile', async () => {
    const store = createMemoryStore({ id: 'only', data: CLIENT_KEYS, persist: true });

    const result = await signIn(fake('me@example.com'), {
        args: ['gmail', 'auth', '--no-browser'],
        stores: [store.store],
        browser: async url => {
            // Another sign-in finishes while this one waits at the browser.
            await store.store.write([{ key: KEY, value: tokensValue('other@example.com') }]);
            await grantConsent(url);
        },
    });

    expect(result.exitCode).toBe(0);
    expect(Object.keys(stored(store.writes))).toEqual(['other@example.com', 'me@example.com']);
});

test('auth writes the token secret when the provider declares no secrets', async () => {
    const store = createMemoryStore({ id: 'only', data: CLIENT_KEYS, persist: true });

    const result = await signIn(fake('me@example.com'), {
        args: ['gmail', 'auth', '--no-browser'],
        stores: [store.store],
        secrets: undefined,
    });

    expect(result.exitCode).toBe(0);
    expect(Object.keys(stored(store.writes))).toEqual(['me@example.com']);
});

test.each<[string, Partial<RunGoogleCommandOptions>, Record<string, string>, string, boolean]>([
    [
        'the account is not allowed',
        { accounts: ['*@work.com'] },
        {},
        'me@example.com is not in the accounts this project allows',
        // The email is known only after the browser step.
        true,
    ],
    [
        'the token secret is not declared',
        { secrets: [defineSecret('OTHER_SECRET')] },
        {},
        `Refusing to write ${KEY}: it is not declared with defineSecret.`,
        false,
    ],
    [
        'the token secret is not enabled here',
        { secrets: [defineSecret(KEY, { enabled: () => false })] },
        {},
        `Refusing to write ${KEY}: it is not enabled in this environment.`,
        false,
    ],
    [
        'target refuses the key',
        {
            target: key => {
                throw new UsageError(`${key} has no store in this repo`);
            },
        },
        {},
        `${KEY} has no store in this repo`,
        false,
    ],
    [
        'the stored value is not a token dictionary',
        {},
        { [KEY]: 'garbage-value' },
        `${KEY} does not hold Google tokens`,
        false,
    ],
])('auth writes nothing when %s', async (_, options, data, message, reachesBrowser) => {
    const google = fake('me@example.com');
    const store = createMemoryStore({ id: 'only', data: { ...CLIENT_KEYS, ...data }, persist: true });
    const consented: URL[] = [];

    const result = await signIn(google, {
        args: ['gmail', 'auth', '--no-browser'],
        stores: [store.store],
        browser: async url => {
            consented.push(url);
            await grantConsent(url);
        },
        ...options,
    });

    expect(result.exitCode).toBe(1);
    expect(result.errors).toContain(message);
    expect(result.errors).not.toContain('garbage-value');
    expect(store.writes).toEqual([]);
    expect(consented.length).toBe(reachesBrowser ? 1 : 0);
    expect(google.grants).toEqual(reachesBrowser ? ['authorization_code'] : []);
    expectNoCredential(result);
});

test('auth without a client secret fails before sign-in', async () => {
    const google = fake('me@example.com');
    const store = createMemoryStore({ id: 'only', data: { GOOGLE_CLIENT_ID: CLIENT_ID } });

    const result = await runGoogleCommand({
        args: ['gmail', 'auth', '--no-browser'],
        stores: [store.store],
        endpoints: google.endpoints,
    });

    expect(result.exitCode).toBe(1);
    expect(result.errors).toContain('GOOGLE_CLIENT_SECRET');
    expect(result.stderr).toBe('');
    expect(google.grants).toEqual([]);
    expect(store.writes).toEqual([]);
});

test('no source file of the package touches the filesystem', async () => {
    // Tokens live only in the stores: nothing here may write a file.
    const dir = import.meta.dirname;
    const sources = (await fs.readdir(dir, { recursive: true })).filter(
        file => file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.includes('__fixtures__'),
    );
    expect(sources).toContain('signInGoogle.ts');

    for (const file of sources) {
        const source = await fs.readFile(path.join(dir, file), 'utf8');
        expect({ file, fs: /from '(node:)?fs(\/promises)?'|Bun\.write|Bun\.file/.test(source) }).toEqual({
            file,
            fs: false,
        });
    }
});

function fake(email: string) {
    const google = startFakeGoogle({ email });
    fakes.push(google);
    return google;
}

/** Runs `auth`, the declared token secret in the provider's declarations by default, consenting in the stand-in browser. */
function signIn(google: ReturnType<typeof startFakeGoogle>, options: Omit<RunGoogleCommandOptions, 'endpoints'>) {
    return runGoogleCommand({
        secrets: [GMAIL_TOKENS],
        browser: grantConsent,
        ...options,
        endpoints: google.endpoints,
    });
}

/** The token dictionary the last write stored. */
function stored(writes: SecretStoreEntry[][]) {
    const value = writes.at(-1)?.find(entry => entry.key === KEY)?.value;
    return Object.fromEntries(parseGoogleTokens(value, KEY));
}

function expectNoCredential(result: GoogleCommandResult) {
    const output = [result.stdout, result.stderr, result.errors].join('\n');
    for (const credential of CREDENTIALS) {
        expect(output).not.toContain(credential);
    }
}
