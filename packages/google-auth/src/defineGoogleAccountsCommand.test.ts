import { afterEach, expect, test } from 'bun:test';

import { createMemoryStore } from '@nzyme/secrets/__fixtures__/createMemoryStore.js';

import {
    CREDENTIALS,
    GMAIL_TOKENS,
    runGoogleCommand,
    SCOPES,
    startFakeGoogle,
    tokensValue,
} from './__fixtures__/googleTestCli.js';

const fakes: ReturnType<typeof startFakeGoogle>[] = [];

afterEach(async () => {
    await Promise.all(fakes.splice(0).map(google => google.stop()));
});

test('accounts lists the accounts in the token secret, marking those not allowed', async () => {
    const google = startFakeGoogle({ email: 'me@example.com' });
    fakes.push(google);
    const store = createMemoryStore({
        id: 'only',
        data: {
            [GMAIL_TOKENS.name]: tokensValue('bob@home.com', 'ann@work.com'),
            OTHER_TOKENS: tokensValue('cat@work.com'),
        },
    });

    const result = await runGoogleCommand({
        args: ['gmail', 'accounts'],
        store: store.store,
        endpoints: google.endpoints,
        accounts: ['*@WORK.com'],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(`ann@work.com\t${SCOPES.join(' ')}\nbob@home.com\tnot allowed\n`);
    const output = [result.stdout, result.stderr, result.errors].join('\n');
    for (const credential of CREDENTIALS) {
        expect(output).not.toContain(credential);
    }
});
