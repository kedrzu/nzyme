import type { Keychain } from './osKeychain.js';
import { osKeychain } from './osKeychain.js';
import type { SecretStore, SecretStoreEntry } from './SecretStore.js';

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

/**
 * Wraps a store with a cache in the keychain, so a repeated read within `ttl` makes no store call.
 * Each key is its own keychain item, `cache:<store.id>:<key>` with a timestamp, so repos reading
 * different keys of one store do not evict each other, and no item outgrows a per-item size cap
 * (Windows Credential Manager holds 2560 bytes). A keychain failure only warns: the read falls through
 * to the store. Values are kept only in the keychain, never in a file.
 */
export function cached(store: SecretStore, options: CachedOptions): SecretStore {
    const keychain = options.keychain ?? osKeychain;

    return {
        id: store.id,
        read,
        write,
        refresh,
        login: store.login?.bind(store),
        credentialEnv: store.credentialEnv,
    };

    async function read(keys: string[]) {
        const items = await Promise.all(keys.map(loadItem));
        const now = Date.now();
        const hit = new Map<string, string>();
        for (const [index, key] of keys.entries()) {
            const item = items[index];
            if (!item || now - item.at >= options.ttl) {
                return await readFromStore(keys);
            }

            hit.set(key, item.value);
        }

        return hit;
    }

    async function refresh(keys: string[]) {
        await readFromStore(keys);
    }

    async function write(entries: SecretStoreEntry[]) {
        await store.write(entries);

        const now = Date.now();
        await Promise.all(entries.map(({ key, value }) => saveItem(key, { value, at: now })));
    }

    async function readFromStore(keys: string[]) {
        const values = await store.read(keys);
        const now = Date.now();
        await Promise.all(
            keys.map(key => {
                const value = values.get(key);
                return value === undefined ? deleteItem(key) : saveItem(key, { value, at: now });
            }),
        );

        return values;
    }

    async function loadItem(key: string): Promise<CachedValue | undefined> {
        let raw: string | null;
        try {
            raw = await keychain.get(itemName(key));
        } catch {
            console.warn(
                `Secrets cache of store ${store.id}: reading the keychain failed for ${key}, reading the store`,
            );
            return undefined;
        }

        if (raw === null) {
            return undefined;
        }

        const item = parseItem(raw);
        if (!item) {
            console.warn(`Secrets cache of store ${store.id}: the keychain item of ${key} is malformed, ignoring it`);
        }

        return item;
    }

    async function saveItem(key: string, item: CachedValue) {
        try {
            await keychain.set(itemName(key), JSON.stringify(item));
        } catch {
            console.warn(`Secrets cache of store ${store.id}: writing the keychain failed for ${key}`);
        }
    }

    async function deleteItem(key: string) {
        try {
            await keychain.delete(itemName(key));
        } catch {
            console.warn(`Secrets cache of store ${store.id}: deleting from the keychain failed for ${key}`);
        }
    }

    function itemName(key: string) {
        return `cache:${store.id}:${key}`;
    }
}

function parseItem(raw: string): CachedValue | undefined {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return undefined;
    }

    if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !('value' in parsed) ||
        typeof parsed.value !== 'string' ||
        !('at' in parsed) ||
        typeof parsed.at !== 'number'
    ) {
        return undefined;
    }

    return { value: parsed.value, at: parsed.at };
}
