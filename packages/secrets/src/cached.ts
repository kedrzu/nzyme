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

interface CacheItem {
    /** `Date.now()` when the store was read. */
    at: number;
    /** What that read returned. */
    values: Record<string, string>;
}

/**
 * Wraps a store with a cache in the keychain, so a repeated `readAll` within `ttl` makes no store call.
 * The whole read is ONE keychain item per store id, holding JSON `{ at, values }`, so the
 * cache can never hold a mix of two reads or a key the store no longer has. A write deletes the item,
 * so the next read goes to the store. A keychain failure or a malformed item only warns: the read falls
 * through to the store. Values are kept only in the keychain, never in a file.
 *
 * One item per store means a store larger than Windows Credential Manager's 2560-byte item cap will not
 * cache there (the keychain refuses it, which only warns); nobody uses Windows today.
 *
 * Outside Bun there is no OS keychain (`Bun.secrets`), so without an explicit `keychain` the store is
 * returned as it is: a tool with a Node shebang that loads secrets, `nuxi` for one, reads the store on
 * every run instead of warning that the keychain failed.
 */
export function cached(store: SecretStore, options: CachedOptions): SecretStore {
    if (!options.keychain && typeof Bun === 'undefined') {
        return store;
    }

    const keychain = options.keychain ?? osKeychain;
    const itemName = `cache:${store.id}`;

    return {
        id: store.id,
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
        await guarded('deleting from', () => keychain.delete(itemName));
    }

    async function readFromCache() {
        const raw = await guarded('reading', () => keychain.get(itemName));
        if (raw == null) {
            return undefined;
        }

        const item = parseItem(raw);
        if (!item) {
            console.warn(`Secrets cache of store ${store.id}: the keychain item is malformed, ignoring it`);
            return undefined;
        }

        if (Date.now() - item.at >= options.ttl) {
            return undefined;
        }

        return new Map(Object.entries(item.values));
    }

    async function readFromStore() {
        const secrets = await store.readAll();
        const item: CacheItem = { at: Date.now(), values: Object.fromEntries(secrets) };
        await guarded('writing', () => keychain.set(itemName, JSON.stringify(item)));

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
}

function parseItem(raw: string): CacheItem | undefined {
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
        !('values' in parsed) ||
        typeof parsed.values !== 'object' ||
        parsed.values === null ||
        Array.isArray(parsed.values)
    ) {
        return undefined;
    }

    const values: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed.values)) {
        if (typeof value !== 'string') {
            return undefined;
        }

        values[key] = value;
    }

    return { at: parsed.at, values };
}
