import { afterEach, expect, setSystemTime, spyOn, test } from 'bun:test';

import { cached } from './cached.js';
import type { Keychain } from './osKeychain.js';
import type { SecretStore, SecretStoreEntry } from './SecretStore.js';

const HOUR = 60 * 60 * 1000;
const SENTINEL = 'sentinel-secret-value-9c1e';

afterEach(() => {
    setSystemTime();
});

test('within the TTL readAll comes from the keychain with no store call', async () => {
    setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const inner = createMemoryStore('bw', { A: 'a', B: 'b' });
    const keychain = createMemoryKeychain();
    const store = cached(inner.store, { ttl: HOUR, keychain });

    expect(await store.readAll()).toEqual(
        new Map([
            ['A', 'a'],
            ['B', 'b'],
        ]),
    );
    inner.values.set('A', 'changed');
    setSystemTime(new Date('2026-01-01T00:59:00Z'));

    expect(await store.readAll()).toEqual(
        new Map([
            ['A', 'a'],
            ['B', 'b'],
        ]),
    );
    expect(inner.reads).toBe(1);
    expect([...keychain.values.keys()]).toEqual(['cache:bw']);
});

test('a read older than the TTL goes to the store again', async () => {
    setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const inner = createMemoryStore('bw', { A: 'a' });
    const store = cached(inner.store, { ttl: HOUR, keychain: createMemoryKeychain() });

    await store.readAll();
    inner.values.set('A', 'a2');
    setSystemTime(new Date('2026-01-01T01:00:00Z'));

    expect(await store.readAll()).toEqual(new Map([['A', 'a2']]));
    expect(inner.reads).toBe(2);
});

test('a write reaches the store and invalidates the cache, so the next read sees the new value', async () => {
    const inner = createMemoryStore('bw', { A: 'a' });
    const store = cached(inner.store, { ttl: HOUR, keychain: createMemoryKeychain() });

    await store.readAll();
    await store.write([{ key: 'A', value: 'a2' }]);

    expect(inner.values.get('A')).toBe('a2');
    expect(await store.readAll()).toEqual(new Map([['A', 'a2']]));
    expect(inner.reads).toBe(2);
});

test('a failing inner write leaves the cache untouched', async () => {
    const inner = createMemoryStore('bw', { A: 'a' });
    const store = cached(
        { ...inner.store, write: () => Promise.reject(new Error('denied')) },
        { ttl: HOUR, keychain: createMemoryKeychain() },
    );

    await store.readAll();
    await expect(store.write([{ key: 'A', value: 'a2' }])).rejects.toThrow('denied');

    expect(await store.readAll()).toEqual(new Map([['A', 'a']]));
    expect(inner.reads).toBe(1);
});

test('refresh re-reads within the TTL and overwrites the item, dropping a vanished key', async () => {
    const inner = createMemoryStore('bw', { A: 'a', B: 'b' });
    const keychain = createMemoryKeychain();
    const store = cached(inner.store, { ttl: HOUR, keychain });

    await store.readAll();
    inner.values.set('A', 'a2');
    inner.values.delete('B');
    await store.refresh?.();

    expect(keychain.values.get('cache:bw')).not.toContain('"B"');
    expect(await store.readAll()).toEqual(new Map([['A', 'a2']]));
    expect(inner.reads).toBe(2);
});

test('caches of two stores, or or of one store behind two prefixes, never mix', async () => {
    const keychain = createMemoryKeychain();
    const one = createMemoryStore('one', { A: 'from-one' });
    const two = createMemoryStore('two', { A: 'from-two' });
    const dev = createMemoryStore('one:DEV_', { A: 'from-dev' });

    const storeOne = cached(one.store, { ttl: HOUR, keychain });
    const storeTwo = cached(two.store, { ttl: HOUR, keychain });
    const storeDev = cached(dev.store, { ttl: HOUR, keychain });
    await storeOne.readAll();

    expect(await storeTwo.readAll()).toEqual(new Map([['A', 'from-two']]));
    expect(await storeDev.readAll()).toEqual(new Map([['A', 'from-dev']]));
    expect(await storeOne.readAll()).toEqual(new Map([['A', 'from-one']]));
    expect([one.reads, two.reads, dev.reads]).toEqual([1, 1, 1]);
});

test('a failing keychain only warns by store id and falls through to the store, never printing a value', async () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    try {
        const inner = createMemoryStore('bw', { A: SENTINEL });
        const keychain: Keychain = {
            get: () => Promise.reject(new Error('locked')),
            set: () => Promise.reject(new Error('locked')),
            delete: () => Promise.reject(new Error('locked')),
        };
        const store = cached(inner.store, { ttl: HOUR, keychain });

        expect(await store.readAll()).toEqual(new Map([['A', SENTINEL]]));
        await store.write([{ key: 'A', value: SENTINEL }]);

        expect(inner.reads).toBe(1);
        const messages = warn.mock.calls.map(args => args.join(' '));
        expect(messages.some(message => message.includes('bw') && message.includes('reading the keychain'))).toBe(true);
        expect(messages.some(message => message.includes('bw') && message.includes('writing the keychain'))).toBe(true);
        expect(messages.join('\n')).not.toContain(SENTINEL);
    } finally {
        warn.mockRestore();
    }
});

test('after a write, a key removed from the store no longer resolves from the cache', async () => {
    const inner = createMemoryStore('bw', { A: 'a', B: 'b' });
    const store = cached(inner.store, { ttl: HOUR, keychain: createMemoryKeychain() });

    await store.readAll();
    inner.values.delete('B');
    await store.write([{ key: 'A', value: 'a2' }]);

    expect(await store.readAll()).toEqual(new Map([['A', 'a2']]));
    expect(inner.reads).toBe(2);
});

test('an item the keychain refuses to save makes the next read go to the store', async () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    try {
        const inner = createMemoryStore('bw', { A: SENTINEL });
        const keychain: Keychain = {
            ...createMemoryKeychain(),
            set: () => Promise.reject(new Error('too large')),
        };
        const store = cached(inner.store, { ttl: HOUR, keychain });

        await store.readAll();

        expect(await store.readAll()).toEqual(new Map([['A', SENTINEL]]));
        expect(inner.reads).toBe(2);
        expect(warn.mock.calls.map(args => args.join(' ')).join('\n')).not.toContain(SENTINEL);
    } finally {
        warn.mockRestore();
    }
});

test('a corrupt or foreign-shaped item is treated as a miss with a warning', async () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    try {
        for (const raw of [
            'not json',
            `"${SENTINEL}"`,
            `{"at":1}`,
            '[1]',
            `{"at":1,"values":{"A":1}}`,
            `{"at":1,"values":[]}`,
        ]) {
            const inner = createMemoryStore('bw', { A: 'a' });
            const keychain = createMemoryKeychain();
            keychain.values.set('cache:bw', raw);

            expect(await cached(inner.store, { ttl: HOUR, keychain }).readAll()).toEqual(new Map([['A', 'a']]));
            expect(inner.reads).toBe(1);
        }

        expect(warn).toHaveBeenCalledTimes(6);
        expect(warn.mock.calls.map(args => args.join(' ')).join('\n')).not.toContain(SENTINEL);
    } finally {
        warn.mockRestore();
    }
});

test('values are kept in the keychain item and nowhere else', async () => {
    const inner = createMemoryStore('bw', { A: SENTINEL });
    const keychain = createMemoryKeychain();
    const store = cached(inner.store, { ttl: HOUR, keychain });

    await store.readAll();

    expect([...keychain.values.keys()]).toEqual(['cache:bw']);
    const item: unknown = JSON.parse(keychain.values.get('cache:bw') ?? '');
    expect(item).toHaveProperty('values', { A: SENTINEL });
});

test('delegates id, login and credentialEnv to the inner store', async () => {
    const logins: string[] = [];
    const inner: SecretStore = {
        ...createMemoryStore('bw', {}).store,
        credentialEnv: ['BWS_ACCESS_TOKEN'],
        login: async prompt => {
            logins.push(await prompt('Access token'));
        },
    };
    const store = cached(inner, { ttl: HOUR, keychain: createMemoryKeychain() });

    await store.login?.(() => Promise.resolve('token'));

    expect(store.id).toBe('bw');
    expect(store.credentialEnv).toEqual(['BWS_ACCESS_TOKEN']);
    expect(logins).toEqual(['token']);
});

function createMemoryStore(id: string, initial: Record<string, string>) {
    const values = new Map(Object.entries(initial));
    const counter = { reads: 0 };
    const store: SecretStore = {
        id,
        readAll: () => {
            counter.reads++;
            return Promise.resolve(new Map(values));
        },
        write: (entries: SecretStoreEntry[]) => {
            for (const { key, value } of entries) {
                values.set(key, value);
            }

            return Promise.resolve();
        },
    };

    return {
        store,
        values,
        get reads() {
            return counter.reads;
        },
    };
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
