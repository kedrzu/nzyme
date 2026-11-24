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

test("delete removes only the given keys and their items, leaving the scope's others and other scopes", async () => {
    const keychain = createMemoryKeychain();
    const store = keychainStore({ scope: 'app', keychain });
    const other = keychainStore({ scope: 'other', keychain });
    await store.write([
        { key: 'A', value: 'a' },
        { key: 'B', value: 'b' },
        { key: 'C', value: 'c' },
    ]);
    await other.write([{ key: 'A', value: 'other-a' }]);

    await store.delete?.(['A', 'missing']);

    expect(await store.readAll()).toEqual(
        new Map([
            ['B', 'b'],
            ['C', 'c'],
        ]),
    );
    expect(JSON.parse(keychain.values.get('keychain:app') ?? '')).toEqual(['B', 'C']);
    expect(keychain.values.has('keychain:app:A')).toBe(false);
    expect(await other.readAll()).toEqual(new Map([['A', 'other-a']]));
});

test('a delete interrupted while removing items leaves no indexed key without a value', async () => {
    const memory = createMemoryKeychain();
    const keychain = { ...memory, delete: () => Promise.reject(new Error('keychain refused to delete')) };
    const store = keychainStore({ scope: 'app', keychain });
    await store.write([
        { key: 'A', value: 'a' },
        { key: 'B', value: 'b' },
    ]);

    await expect(store.delete?.(['A'])).rejects.toThrow('refused');

    expect(JSON.parse(memory.values.get('keychain:app') ?? '')).toEqual(['B']);
    expect(await store.readAll()).toEqual(new Map([['B', 'b']]));
});

test.each(['not json', '{"A":1}', '[1,2]', '"A"'])(
    'a malformed index (%s) makes delete throw and leaves the index and items untouched',
    async raw => {
        const keychain = createMemoryKeychain();
        keychain.values.set('keychain:app', raw);
        keychain.values.set('keychain:app:A', 'a');
        const store = keychainStore({ scope: 'app', keychain });

        await expect(store.delete?.(['A'])).rejects.toThrow('keychain:app');
        expect(keychain.values.get('keychain:app')).toBe(raw);
        expect(keychain.values.get('keychain:app:A')).toBe('a');
    },
);
