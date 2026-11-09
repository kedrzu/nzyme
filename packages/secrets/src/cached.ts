import type { Keychain } from './osKeychain.js';
import { osKeychain } from './osKeychain.js';
import type { SecretStore, SecretStoreEntry } from './SecretStore.js';

/**
 * Options of {@link cached}.
 */
export interface CachedOptions {
    /** How long a cached read is used, in milliseconds; an older one is re-read from the store. */
    ttl: number;
    /** Where the cache is kept; the OS keychain by default. */
    keychain?: Keychain;
}

interface CacheIndex {
    /** `Date.now()` when the store was read. */
    at: number;
    /** The keys that read returned. */
    keys: string[];
}

/**
 * Wraps a store with a cache in the keychain, so a repeated `readAll` within `ttl` makes no store call.
 * The whole read is cached per store id and prefix: one index item with the timestamp and the keys,
 * plus one item per value, so no item outgrows a per-item size cap (Windows Credential Manager holds
 * 2560 bytes). A write invalidates the index, so the next read goes to the store. A keychain failure
 * only warns: the read falls through to the store. Values are kept only in the keychain, never in a file.
 */
export function cached(store: SecretStore, options: CachedOptions): SecretStore {
    const keychain = options.keychain ?? osKeychain;
    const scope = `${store.id}:${store.prefix}`;
    const indexName = `cache-index:${scope}`;

    return {
        id: store.id,
        prefix: store.prefix,
        readAll,
        write,
        refresh,
        login: store.login?.bind(store),
        credentialEnv: store.credentialEnv,
    };

    async function readAll() {
        const hit = await readFromCache();
        return hit ?? (await readFromStore());
    }

    async function refresh() {
        await readFromStore();
    }

    async function write(entries: SecretStoreEntry[]) {
        await store.write(entries);
        await guarded('deleting from', () => keychain.delete(indexName));
    }

    async function readFromCache() {
        const raw = await guarded('reading', () => keychain.get(indexName));
        if (raw == null) {
            return undefined;
        }

        const index = parseIndex(raw);
        if (!index) {
            console.warn(`Secrets cache of store ${store.id}: the keychain index is malformed, ignoring it`);
            return undefined;
        }

        if (Date.now() - index.at >= options.ttl) {
            return undefined;
        }

        const values = await Promise.all(index.keys.map(key => guarded('reading', () => keychain.get(itemName(key)))));
        const result = new Map<string, string>();
        for (const [position, key] of index.keys.entries()) {
            const value = values[position];
            if (value == null) {
                return undefined;
            }

            result.set(key, value);
        }

        return result;
    }

    async function readFromStore() {
        const secrets = await store.readAll();
        const previous = await guarded('reading', () => keychain.get(indexName));
        const stale = previous == null ? [] : (parseIndex(previous)?.keys ?? []);

        await Promise.all([
            ...[...secrets].map(([key, value]) => guarded('writing', () => keychain.set(itemName(key), value))),
            ...stale
                .filter(key => !secrets.has(key))
                .map(key => guarded('deleting from', () => keychain.delete(itemName(key)))),
        ]);
        const index: CacheIndex = { at: Date.now(), keys: [...secrets.keys()] };
        await guarded('writing', () => keychain.set(indexName, JSON.stringify(index)));

        return secrets;
    }

    /** Runs a keychain call; a failure only warns (naming the store, never a key or value) and yields `undefined`. */
    async function guarded<T>(action: string, call: () => Promise<T>): Promise<T | undefined> {
        try {
            return await call();
        } catch {
            console.warn(`Secrets cache of store ${store.id}: ${action} the keychain failed`);
            return undefined;
        }
    }

    function itemName(key: string) {
        return `cache:${scope}:${key}`;
    }
}

function parseIndex(raw: string): CacheIndex | undefined {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return undefined;
    }

    if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !('at' in parsed) ||
        typeof parsed.at !== 'number' ||
        !('keys' in parsed) ||
        !Array.isArray(parsed.keys) ||
        !parsed.keys.every((key): key is string => typeof key === 'string')
    ) {
        return undefined;
    }

    return { at: parsed.at, keys: parsed.keys };
}
