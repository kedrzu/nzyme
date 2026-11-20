import { afterEach, expect, test } from 'bun:test';

import { createMemoryStore } from '@nzyme/secrets/__fixtures__/createMemoryStore.js';

import type { FakeGoogleOptions, GoogleCommandResult } from './__fixtures__/googleTestCli.js';
import {
    CLIENT_ID,
    CLIENT_SECRET,
    CREDENTIALS,
    REFRESH_TOKEN,
    runGoogleCommand,
    SCOPES,
    startFakeGoogle,
    tokenValue,
} from './__fixtures__/googleTestCli.js';

const CLIENT = { GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: CLIENT_SECRET };
const KEY = 'GOOGLE_GMAIL_TOKEN_ME_EXAMPLE_COM';
const fakes: ReturnType<typeof startFakeGoogle>[] = [];

afterEach(async () => {
    await Promise.all(fakes.splice(0).map(google => google.stop()));
});

test('accounts lists the signed-in accounts of the service, marking those not allowed', async () => {
    const google = fake({ email: 'me@example.com' });
    const store = createMemoryStore({
        id: 'only',
        data: {
            GOOGLE_GMAIL_TOKEN_ANN_WORK_COM: tokenValue('Ann@Work.com'),
            GOOGLE_GMAIL_TOKEN_BOB_HOME_COM: tokenValue('bob@home.com'),
            GOOGLE_DRIVE_TOKEN_CAT_WORK_COM: tokenValue('cat@work.com'),
            GOOGLE_GMAIL_TOKEN_BROKEN: 'not json',
        },
    });

    const result = await runGoogleCommand({
        args: ['gmail', 'accounts'],
        stores: [store.store],
        endpoints: google.endpoints,
        accounts: ['*@work.com'],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(`Ann@Work.com\t${SCOPES.join(' ')}\nbob@home.com\tnot allowed\n`);
    expectNoCredential(result);
});

test.each([
    ['not allowed', 'bob@home.com', 'not in the accounts this project allows'],
    ['without a token', 'eve@work.com', '`nzyme gmail auth --login-hint eve@work.com`'],
])('an account %s is refused by name before any call to Google', async (_, account, reason) => {
    const google = fake({ email: account });
    const store = createMemoryStore({
        id: 'only',
        data: { ...CLIENT, GOOGLE_GMAIL_TOKEN_BOB_HOME_COM: tokenValue('bob@home.com') },
    });

    const result = await runGoogleCommand({
        args: ['gmail', 'whoami', '--account', account],
        stores: [store.store],
        endpoints: google.endpoints,
        accounts: ['*@work.com'],
    });

    expect(result.exitCode).toBe(1);
    expect(result.errors).toContain(account);
    expect(result.errors).toContain(reason);
    expect(google.grants).toEqual([]);
});

test('without --account several usable accounts are listed, and a single one is used', async () => {
    const google = fake({ email: 'me@example.com' });
    const two = createMemoryStore({
        id: 'two',
        data: { ...CLIENT, [KEY]: tokenValue('me@example.com'), GOOGLE_GMAIL_TOKEN_YOU_X_COM: tokenValue('you@x.com') },
    });
    const one = createMemoryStore({ id: 'one', data: { ...CLIENT, [KEY]: tokenValue('me@example.com') } });

    const several = await runGoogleCommand({
        args: ['gmail', 'whoami'],
        stores: [two.store],
        endpoints: google.endpoints,
    });
    const single = await runGoogleCommand({
        args: ['gmail', 'whoami'],
        stores: [one.store],
        endpoints: google.endpoints,
    });

    expect(several.exitCode).toBe(1);
    expect(several.errors).toContain('me@example.com, you@x.com');
    expect(single).toMatchObject({ exitCode: 0, stdout: 'me@example.com\n' });
});

test('a revoked refresh token fails with the sign-in command and stays in place', async () => {
    const google = fake({ email: 'me@example.com', revoked: [REFRESH_TOKEN] });
    const store = createMemoryStore({ id: 'only', data: { ...CLIENT, [KEY]: tokenValue('me@example.com') } });

    const result = await runGoogleCommand({
        args: ['gmail', 'whoami'],
        stores: [store.store],
        endpoints: google.endpoints,
    });

    expect(result.exitCode).toBe(1);
    expect(result.errors).toContain('`nzyme gmail auth --login-hint me@example.com`');
    expect(google.grants).toEqual(['refresh_token']);
    expect(store.writes).toEqual([]);
    expect((await store.store.readAll()).get(KEY)).toBe(tokenValue('me@example.com'));
    expectNoCredential(result);
});

test.each(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'])(
    'a missing %s fails with the sign-in command and leaves the token in place',
    async missing => {
        const google = fake({ email: 'me@example.com' });
        const data: Record<string, string> = { ...CLIENT, [KEY]: tokenValue('me@example.com') };
        delete data[missing];
        const store = createMemoryStore({ id: 'only', data });

        const result = await runGoogleCommand({
            args: ['gmail', 'whoami'],
            stores: [store.store],
            endpoints: google.endpoints,
        });

        expect(result.exitCode).toBe(1);
        expect(result.errors).toContain(missing);
        expect(result.errors).toContain('`nzyme gmail auth`');
        expect(google.grants).toEqual([]);
        expect(store.writes).toEqual([]);
        expectNoCredential(result);
    },
);

function fake(options: FakeGoogleOptions) {
    const google = startFakeGoogle(options);
    fakes.push(google);
    return google;
}

function expectNoCredential(result: GoogleCommandResult) {
    const output = [result.stdout, result.stderr, result.errors].join('\n');
    for (const credential of CREDENTIALS) {
        expect(output).not.toContain(credential);
    }
}
