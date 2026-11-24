import type { Keychain } from './osKeychain.js';
import { osKeychain } from './osKeychain.js';
import type { SecretStore, SecretStoreEntry } from './SecretStore.js';

/**
 * Options of {@link keychainStore}.
 */
export interface KeychainStoreOptions {
    /** Names this store's set of keys; one scope never sees another's. Not empty, blank or containing `:`. */
    scope: string;
    /** Where the items are kept; the OS keychain by default. */
    keychain?: Keychain;
}

/**
 * A store that keeps secrets in the OS keychain of the current user (via `Bun.secrets`), one item per
 * secret: `keychain:<scope>:<key>` holds the raw value. `Bun.secrets` cannot list items, so the item
 * `keychain:<scope>` holds a JSON array of the scope's keys. `readAll` returns every indexed key that has
 * an item, skipping one whose item is gone. `write` sets every value item first and the index last, so
 * an interrupted write leaves at worst an unindexed item, never an indexed key without a value. `delete`
 * goes the other way: it rewrites the index without the keys first and deletes the items after, so an
 * interrupted delete likewise leaves at worst an unindexed item.
 *
 * A malformed index makes `readAll`, `write` and `delete` throw, and neither of the last two overwrites it. Two concurrent
 * writes to one scope can drop a key from the index (re-running the write repairs it). There is no
 * `login`, `refresh` or `credentialEnv`: the OS session unlocks the keychain.
 *
 * Outside Bun, without an explicit `keychain`, `readAll`, `write` and `delete` throw when called.
 * @__NO_SIDE_EFFECTS__
 */
export function keychainStore(options: KeychainStoreOptions): SecretStore {
    const { scope } = options;
    if (scope.trim() === '' || scope.includes(':')) {
        throw new Error(`Keychain store scope must not be empty, blank or contain ":", got ${JSON.stringify(scope)}`);
    }

    const id = `keychain:${scope}`;
    const itemName = (key: string) => `${id}:${key}`;

    return { id, readAll, write, delete: deleteKeys };

    function getKeychain() {
        if (!options.keychain && typeof Bun === 'undefined') {
            throw new Error(`Keychain store ${id} needs Bun (Bun.secrets)`);
        }

        return options.keychain ?? osKeychain;
    }

    async function readIndex(keychain: Keychain) {
        const raw = await keychain.get(id);
        if (raw == null) {
            return [];
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch {
            throw new Error(`Keychain store ${id}: the index item is malformed (not JSON)`);
        }

        if (!Array.isArray(parsed) || !parsed.every((key): key is string => typeof key === 'string')) {
            throw new Error(`Keychain store ${id}: the index item is malformed (not a JSON array of strings)`);
        }

        return parsed;
    }

    async function readAll() {
        const keychain = getKeychain();
        const keys = await readIndex(keychain);
        const values = await Promise.all(keys.map(key => keychain.get(itemName(key))));
        const result = new Map<string, string>();
        keys.forEach((key, i) => {
            const value = values[i];
            if (value != null) {
                result.set(key, value);
            }
        });

        return result;
    }

    async function write(entries: SecretStoreEntry[]) {
        const keychain = getKeychain();
        for (const { key } of entries) {
            if (key === '') {
                throw new Error(`Keychain store ${id}: a secret key must not be empty`);
            }
        }

        await readIndex(keychain);
        for (const { key, value } of entries) {
            await keychain.set(itemName(key), value);
        }

        const keys = new Set(await readIndex(keychain));
        for (const { key } of entries) {
            keys.add(key);
        }

        await keychain.set(id, JSON.stringify([...keys]));
    }

    async function deleteKeys(keys: string[]) {
        const keychain = getKeychain();
        const indexed = await readIndex(keychain);
        const removed = new Set(keys);
        const remaining = indexed.filter(key => !removed.has(key));
        await keychain.set(id, JSON.stringify(remaining));

        for (const key of removed) {
            await keychain.delete(itemName(key));
        }
    }
}
