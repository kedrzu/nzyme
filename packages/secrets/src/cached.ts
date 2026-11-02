import type { Keychain } from './osKeychain.js';
import { osKeychain } from './osKeychain.js';
import type { SecretStore, SecretStoreEntry } from './SecretStore.js';
import { defineSecretStore } from './SecretStore.js';

/**
 * Options of {@link cached}.
 */
export interface CachedOptions {
    /** How long a cached value is used, in milliseconds; an older one is re-read from the store. */
    ttl: number;
    /** Where the cache is kept; the OS keychain by default. */
    keychain?: Keychain;
}

interface CachedValue {
    value: string;
    /** `Date.now()` when the value was read from the store. */
    at: number;
}

type CacheEntry = Map<string, CachedValue>;

/**
 * Wraps a store with a cache in the keychain, so a repeated read within `ttl` makes no store call.
 * The cache is one keychain entry per `store.id`, with a timestamp per key, so repos reading different
 * keys of one store do not evict each other. A keychain failure only warns: the read falls through to
 * the store. Values are kept only in the keychain, never in a file.
 */
export function cached(store: SecretStore, options: CachedOptions): SecretStore {
    const keychain = options.keychain ?? osKeychain;
    const entryName = `cache:${store.id}`;

    return defineSecretStore({
        id: store.id,
        read,
        write,
        refresh,
        login: store.login?.bind(store),
        credentialEnv: store.credentialEnv,
    });

    async function read(keys: string[]) {
        const entry = await loadEntry();
        const now = Date.now();
        const hit = new Map<string, string>();
        for (const key of keys) {
            const item = entry.get(key);
            if (!item || now - item.at >= options.ttl) {
                return await readFromStore(entry, keys);
            }

            hit.set(key, item.value);
        }

        return hit;
    }

    async function refresh(keys: string[]) {
        await readFromStore(await loadEntry(), keys);
    }

    async function write(entries: SecretStoreEntry[]) {
        await store.write(entries);

        const entry = await loadEntry();
        const now = Date.now();
        for (const { key, value } of entries) {
            entry.set(key, { value, at: now });
        }

        await saveEntry(entry);
    }

    async function readFromStore(entry: CacheEntry, keys: string[]) {
        const values = await store.read(keys);
        const now = Date.now();
        const next = new Map(entry);
        for (const key of keys) {
            const value = values.get(key);
            if (value === undefined) {
                next.delete(key);
            } else {
                next.set(key, { value, at: now });
            }
        }

        await saveEntry(next);
        return values;
    }

    async function loadEntry(): Promise<CacheEntry> {
        let raw: string | null;
        try {
            raw = await keychain.get(entryName);
        } catch {
            console.warn(`Secrets cache of store ${store.id}: reading the keychain failed, reading the store`);
            return new Map();
        }

        if (raw === null) {
            return new Map();
        }

        const entry = parseEntry(raw);
        if (!entry) {
            console.warn(`Secrets cache of store ${store.id}: the keychain entry is malformed, ignoring it`);
            return new Map();
        }

        return entry;
    }

    async function saveEntry(entry: CacheEntry) {
        try {
            await keychain.set(entryName, JSON.stringify(Object.fromEntries(entry)));
        } catch {
            console.warn(`Secrets cache of store ${store.id}: writing the keychain failed`);
        }
    }
}

function parseEntry(raw: string): CacheEntry | undefined {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return undefined;
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return undefined;
    }

    const entry: CacheEntry = new Map();
    const items: [string, unknown][] = Object.entries(parsed);
    for (const [key, item] of items) {
        if (
            typeof item !== 'object' ||
            item === null ||
            !('value' in item) ||
            typeof item.value !== 'string' ||
            !('at' in item) ||
            typeof item.at !== 'number'
        ) {
            return undefined;
        }

        entry.set(key, { value: item.value, at: item.at });
    }

    return entry;
}
