import { afterEach, expect, setSystemTime, spyOn, test } from 'bun:test';

import { cached } from './cached.js';
import type { Keychain } from './osKeychain.js';
import type { SecretStoreEntry } from './SecretStore.js';
import { defineSecretStore } from './SecretStore.js';

const HOUR = 60 * 60 * 1000;
const SENTINEL = 'sentinel-secret-value-9c1e';

afterEach(() => {
    setSystemTime();
});

test('within the TTL every requested key comes from the keychain with no store call', async () => {
    setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const inner = createMemoryStore('bw', { A: 'a', B: 'b' });
    const keychain = createMemoryKeychain();
    const store = cached(inner.store, { ttl: HOUR, keychain });

    expect(await store.read(['A', 'B'])).toEqual(
        new Map([
            ['A', 'a'],
            ['B', 'b'],
        ]),
    );
    inner.values.set('A', 'changed');
    setSystemTime(new Date('2026-01-01T00:59:00Z'));

    expect(await store.read(['A', 'B'])).toEqual(
        new Map([
            ['A', 'a'],
            ['B', 'b'],
        ]),
    );
    expect(await store.read(['B'])).toEqual(new Map([['B', 'b']]));
    expect(inner.reads).toEqual([['A', 'B']]);
    expect([...keychain.values.keys()]).toEqual(['cache:bw']);
    expect(keychain.values.get('cache:bw')).toContain('"a"');
});

test('a value older than the TTL is re-read with the whole requested batch', async () => {
    setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const inner = createMemoryStore('bw', { A: 'a', B: 'b' });
    const store = cached(inner.store, { ttl: HOUR, keychain: createMemoryKeychain() });

    await store.read(['A']);
    setSystemTime(new Date('2026-01-01T00:30:00Z'));
    await store.read(['B']);
    inner.values.set('A', 'a2');
    inner.values.set('B', 'b2');
    setSystemTime(new Date('2026-01-01T01:00:00Z'));

    expect(await store.read(['A', 'B'])).toEqual(
        new Map([
            ['A', 'a2'],
            ['B', 'b2'],
        ]),
    );
    expect(inner.reads).toEqual([['A'], ['B'], ['A', 'B']]);
});

test('a missing key makes one read of the whole batch and is not cached as absent', async () => {
    const inner = createMemoryStore('bw', { A: 'a' });
    const store = cached(inner.store, { ttl: HOUR, keychain: createMemoryKeychain() });

    await store.read(['A']);
    expect(await store.read(['A', 'MISSING'])).toEqual(new Map([['A', 'a']]));
    inner.values.set('MISSING', 'now-here');

    expect(await store.read(['A', 'MISSING'])).toEqual(
        new Map([
            ['A', 'a'],
            ['MISSING', 'now-here'],
        ]),
    );
    expect(inner.reads).toEqual([['A'], ['A', 'MISSING'], ['A', 'MISSING']]);
});

test('write updates the entry, so the next read sees the new value without a store read', async () => {
    const inner = createMemoryStore('bw', { A: 'a' });
    const store = cached(inner.store, { ttl: HOUR, keychain: createMemoryKeychain() });

    await store.read(['A']);
    await store.write([{ key: 'A', value: 'a2' }]);

    expect(inner.values.get('A')).toBe('a2');
    expect(await store.read(['A'])).toEqual(new Map([['A', 'a2']]));
    expect(inner.reads).toEqual([['A']]);
});

test('a failing inner write leaves the cache untouched', async () => {
    const inner = createMemoryStore('bw', { A: 'a' });
    const store = cached(defineSecretStore({ ...inner.store, write: () => Promise.reject(new Error('denied')) }), {
        ttl: HOUR,
        keychain: createMemoryKeychain(),
    });

    await store.read(['A']);
    await expect(store.write([{ key: 'A', value: 'a2' }])).rejects.toThrow('denied');

    expect(await store.read(['A'])).toEqual(new Map([['A', 'a']]));
});

test('refresh re-reads the keys within the TTL and replaces them in the entry', async () => {
    const inner = createMemoryStore('bw', { A: 'a', B: 'b' });
    const store = cached(inner.store, { ttl: HOUR, keychain: createMemoryKeychain() });

    await store.read(['A', 'B']);
    inner.values.set('A', 'a2');
    inner.values.delete('B');
    await store.refresh?.(['A', 'B']);
    inner.values.set('B', 'b2');

    expect(await store.read(['A'])).toEqual(new Map([['A', 'a2']]));
    expect(await store.read(['A', 'B'])).toEqual(
        new Map([
            ['A', 'a2'],
            ['B', 'b2'],
        ]),
    );
    expect(inner.reads).toEqual([
        ['A', 'B'],
        ['A', 'B'],
        ['A', 'B'],
    ]);
});

test('entries of two store ids never mix', async () => {
    const keychain = createMemoryKeychain();
    const one = createMemoryStore('one', { A: 'from-one' });
    const two = createMemoryStore('two', { A: 'from-two' });
    const storeOne = cached(one.store, { ttl: HOUR, keychain });
    const storeTwo = cached(two.store, { ttl: HOUR, keychain });

    await storeOne.read(['A']);

    expect(await storeTwo.read(['A'])).toEqual(new Map([['A', 'from-two']]));
    expect(await storeOne.read(['A'])).toEqual(new Map([['A', 'from-one']]));
    expect(two.reads).toEqual([['A']]);
    expect(one.reads).toEqual([['A']]);
});

test('a failing keychain read or write warns by store id and falls through to the store', async () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    try {
        const inner = createMemoryStore('bw', { A: SENTINEL });
        const keychain: Keychain = {
            get: () => Promise.reject(new Error('locked')),
            set: () => Promise.reject(new Error('locked')),
            delete: () => Promise.reject(new Error('locked')),
        };
        const store = cached(inner.store, { ttl: HOUR, keychain });

        expect(await store.read(['A'])).toEqual(new Map([['A', SENTINEL]]));
        await store.write([{ key: 'A', value: SENTINEL }]);

        expect(inner.reads).toEqual([['A']]);
        const messages = warn.mock.calls.map(args => args.join(' '));
        expect(messages.some(message => message.includes('bw') && message.includes('reading the keychain'))).toBe(true);
        expect(messages.some(message => message.includes('bw') && message.includes('writing the keychain'))).toBe(true);
        expect(messages.join('\n')).not.toContain(SENTINEL);
    } finally {
        warn.mockRestore();
    }
});

test('a corrupt or foreign-shaped entry is treated as empty with a warning', async () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    try {
        for (const raw of ['not json', `{"A":"${SENTINEL}"}`, '[1]']) {
            const inner = createMemoryStore('bw', { A: 'a' });
            const keychain = createMemoryKeychain();
            keychain.values.set('cache:bw', raw);

            expect(await cached(inner.store, { ttl: HOUR, keychain }).read(['A'])).toEqual(new Map([['A', 'a']]));
            expect(inner.reads).toEqual([['A']]);
        }

        expect(warn).toHaveBeenCalledTimes(3);
        expect(warn.mock.calls.map(args => args.join(' ')).join('\n')).not.toContain(SENTINEL);
    } finally {
        warn.mockRestore();
    }
});

test('delegates login and credentialEnv to the inner store', async () => {
    const logins: string[] = [];
    const inner = defineSecretStore({
        ...createMemoryStore('bw', {}).store,
        credentialEnv: ['BWS_ACCESS_TOKEN'],
        login: async context => {
            logins.push(await context.prompt('Access token'));
        },
    });
    const store = cached(inner, { ttl: HOUR, keychain: createMemoryKeychain() });

    await store.login?.({ prompt: () => Promise.resolve('token') });

    expect(store.id).toBe('bw');
    expect(store.credentialEnv).toEqual(['BWS_ACCESS_TOKEN']);
    expect(logins).toEqual(['token']);
});

function createMemoryStore(id: string, initial: Record<string, string>) {
    const values = new Map(Object.entries(initial));
    const reads: string[][] = [];
    const store = defineSecretStore({
        id,
        read: keys => {
            reads.push(keys);
            const result = new Map<string, string>();
            for (const key of keys) {
                const value = values.get(key);
                if (value !== undefined) {
                    result.set(key, value);
                }
            }

            return Promise.resolve(result);
        },
        write: (entries: SecretStoreEntry[]) => {
            for (const { key, value } of entries) {
                values.set(key, value);
            }

            return Promise.resolve();
        },
    });

    return { store, values, reads };
}

function createMemoryKeychain() {
    const values = new Map<string, string>();
    const keychain: Keychain = {
        get: name => Promise.resolve(values.get(name) ?? null),
        set: (name, value) => {
            values.set(name, value);
            return Promise.resolve();
        },
        delete: name => Promise.resolve(values.delete(name)),
    };

    return { ...keychain, values };
}
