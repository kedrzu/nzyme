import fs from 'node:fs/promises';
import path from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { UsageError } from '@nzyme/cli-core';
import { createMemoryStore } from '@nzyme/secrets/__fixtures__/createMemoryStore.js';

import type { GoogleCommandResult } from './__fixtures__/googleTestCli.js';
import {
    CLIENT_ID,
    CLIENT_SECRET,
    CREDENTIALS,
    grantConsent,
    REFRESH_TOKEN,
    runGoogleCommand,
    SCOPES,
    startFakeGoogle,
    tokenValue,
} from './__fixtures__/googleTestCli.js';
import type { GoogleToken } from './googleTokenKey.js';

const KEY = 'GOOGLE_GMAIL_TOKEN_ME_EXAMPLE_COM';
const fakes: ReturnType<typeof startFakeGoogle>[] = [];

afterEach(async () => {
    await Promise.all(fakes.splice(0).map(google => google.stop()));
});

test('auth writes the token through target and accounts reads it back, printing no credential', async () => {
    const google = fake('me@example.com');
    const client = createMemoryStore({
        id: 'client',
        data: { GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: CLIENT_SECRET },
    });
    const tokens = createMemoryStore({ id: 'tokens', persist: true });
    const stores = [client.store, tokens.store];
    const targeted: string[] = [];
    let consentUrl: URL | undefined;

    const auth = await runGoogleCommand({
        args: ['gmail', 'auth', '--no-browser', '--login-hint', 'me@example.com'],
        stores,
        target: key => {
            targeted.push(key);
            return tokens.store;
        },
        endpoints: google.endpoints,
        browser: async url => {
            consentUrl = url;
            await grantConsent(url);
        },
    });

    expect(auth.exitCode).toBe(0);
    expect(targeted).toEqual([KEY]);
    expect(client.writes).toEqual([]);
    const [write] = tokens.writes;
    expect(write?.map(entry => entry.key)).toEqual([KEY]);
    const stored = JSON.parse(write?.[0]?.value ?? '{}') as GoogleToken;
    expect(stored).toMatchObject({ email: 'me@example.com', refreshToken: REFRESH_TOKEN, scopes: SCOPES });
    expect(consentUrl?.searchParams.get('scope')).toBe(SCOPES.join(' '));
    expect(consentUrl?.searchParams.get('access_type')).toBe('offline');
    expect(consentUrl?.searchParams.get('code_challenge_method')).toBe('S256');

    const accounts = await runGoogleCommand({ args: ['gmail', 'accounts'], stores, endpoints: google.endpoints });

    expect(accounts.exitCode).toBe(0);
    expect(accounts.stdout).toBe(`me@example.com\t${SCOPES.join(' ')}\n`);
    expectNoCredential(auth);
    expectNoCredential(accounts);
});

test('auth writes nothing and reports target’s message when target refuses the key', async () => {
    const google = fake('me@example.com');
    const store = createMemoryStore({
        id: 'only',
        data: { GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: CLIENT_SECRET },
        persist: true,
    });

    const result = await runGoogleCommand({
        args: ['gmail', 'auth', '--no-browser'],
        stores: [store.store],
        target: key => {
            throw new UsageError(`${key} has no store in this repo`);
        },
        endpoints: google.endpoints,
        browser: grantConsent,
    });

    expect(result.exitCode).toBe(1);
    expect(result.errors).toContain(`${KEY} has no store in this repo`);
    expect(store.writes).toEqual([]);
    expectNoCredential(result);
});

test('auth refuses an account whose key already holds another email', async () => {
    // `me.example@com` and `me@example.com` both map to GOOGLE_GMAIL_TOKEN_ME_EXAMPLE_COM.
    const google = fake('me.example@com');
    const store = createMemoryStore({
        id: 'only',
        data: { GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: CLIENT_SECRET, [KEY]: tokenValue('me@example.com') },
        persist: true,
    });

    const result = await runGoogleCommand({
        args: ['gmail', 'auth', '--no-browser'],
        stores: [store.store],
        endpoints: google.endpoints,
        browser: grantConsent,
    });

    expect(result.exitCode).toBe(1);
    expect(result.errors).toContain('me@example.com');
    expect(result.errors).toContain('me.example@com');
    expect(store.writes).toEqual([]);
    expectNoCredential(result);
});

test('auth without a client secret fails before sign-in and names the sign-in command', async () => {
    const google = fake('me@example.com');
    const store = createMemoryStore({ id: 'only', data: { GOOGLE_CLIENT_ID: CLIENT_ID } });

    const result = await runGoogleCommand({
        args: ['gmail', 'auth', '--no-browser'],
        stores: [store.store],
        endpoints: google.endpoints,
    });

    expect(result.exitCode).toBe(1);
    expect(result.errors).toContain('GOOGLE_CLIENT_SECRET');
    expect(result.errors).toContain('`nzyme gmail auth`');
    expect(result.stderr).toBe('');
    expect(google.grants).toEqual([]);
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

function expectNoCredential(result: GoogleCommandResult) {
    const output = [result.stdout, result.stderr, result.errors].join('\n');
    for (const credential of CREDENTIALS) {
        expect(output).not.toContain(credential);
    }
}
