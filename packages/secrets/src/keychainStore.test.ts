import { expect, test } from 'bun:test';

import { createMemoryKeychain } from './__fixtures__/createMemoryKeychain.js';
import { keychainStore } from './keychainStore.js';

const SENTINEL = 'sentinel-secret-value-9c1e';

function messageOf(error: unknown) {
    return error instanceof Error ? error.message : '';
}

test('values written by one instance are read by a new instance on the same keychain', async () => {
    const keychain = createMemoryKeychain();
    await keychainStore({ scope: 'app', keychain }).write([
        { key: 'A', value: 'a' },
        { key: 'B', value: 'b' },
    ]);
    await keychainStore({ scope: 'app', keychain }).write([
        { key: 'B', value: 'b2' },
        { key: 'C', value: 'c' },
    ]);

    expect(await keychainStore({ scope: 'app', keychain }).readAll()).toEqual(
        new Map([
            ['A', 'a'],
            ['B', 'b2'],
            ['C', 'c'],
        ]),
    );
    expect(JSON.parse(keychain.values.get('keychain:app') ?? '')).toEqual(['A', 'B', 'C']);
});

test('scopes never see each other and have distinct ids', async () => {
    const keychain = createMemoryKeychain();
    const dev = keychainStore({ scope: 'app-dev', keychain });
    const personal = keychainStore({ scope: 'personal', keychain });
    await dev.write([{ key: 'A', value: 'dev' }]);
    await personal.write([{ key: 'B', value: 'me' }]);

    expect(dev.id).not.toBe(personal.id);
    expect(await dev.readAll()).toEqual(new Map([['A', 'dev']]));
    expect(await personal.readAll()).toEqual(new Map([['B', 'me']]));
});

test('an indexed key whose item is missing is skipped and the others are returned', async () => {
    const keychain = createMemoryKeychain();
    const store = keychainStore({ scope: 'app', keychain });
    await store.write([
        { key: 'A', value: 'a' },
        { key: 'B', value: 'b' },
    ]);
    keychain.values.delete('keychain:app:A');

    expect(await store.readAll()).toEqual(new Map([['B', 'b']]));
});

test('a set failing on one value item leaves the index unchanged and the error free of values', async () => {
    const keychain = createMemoryKeychain({ failSet: name => name === 'keychain:app:B' });
    const store = keychainStore({ scope: 'app', keychain });
    await store.write([{ key: 'A', value: 'a' }]);

    const error = await store
        .write([
            { key: 'C', value: SENTINEL },
            { key: 'B', value: SENTINEL },
        ])
        .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect(messageOf(error)).not.toContain(SENTINEL);
    expect(JSON.parse(keychain.values.get('keychain:app') ?? '')).toEqual(['A']);
    expect(await store.readAll()).toEqual(new Map([['A', 'a']]));
});

test('an invalid scope is rejected at creation', () => {
    for (const scope of ['', '   ', 'a:b']) {
        expect(() => keychainStore({ scope, keychain: createMemoryKeychain() })).toThrow();
    }
});

test('an empty key is rejected by write before any keychain call', async () => {
    const keychain = createMemoryKeychain();
    const store = keychainStore({ scope: 'app', keychain });

    const error = await store
        .write([
            { key: 'A', value: SENTINEL },
            { key: '', value: SENTINEL },
        ])
        .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect(messageOf(error)).not.toContain(SENTINEL);
    expect(keychain.values.size).toBe(0);
});

test.each(['not json', '{"A":1}', '[1,2]', '"A"'])(
    'a malformed index (%s) throws from readAll and write, and write leaves it untouched',
    async raw => {
        const keychain = createMemoryKeychain();
        keychain.values.set('keychain:app', raw);
        const store = keychainStore({ scope: 'app', keychain });

        await expect(store.readAll()).rejects.toThrow('keychain:app');
        await expect(store.write([{ key: 'A', value: SENTINEL }])).rejects.toThrow('keychain:app');
        expect(keychain.values.get('keychain:app')).toBe(raw);
        expect(keychain.values.has('keychain:app:A')).toBe(false);
    },
);
