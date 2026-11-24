import type { SecretStore } from '../SecretStore.js';

/**
 * What one store holds.
 */
export interface StoreSecrets {
    storeId: string;
    /** Its secrets by key (without prefix). */
    secrets: Map<string, string>;
}

/**
 * Reads every store in parallel. All-or-nothing: when any read fails, it rejects and nothing is
 * returned. Prints nothing; the caller decides what to do with the values.
 * @util
 */
export async function readStores(stores: SecretStore[]): Promise<StoreSecrets[]> {
    return await Promise.all(stores.map(async store => ({ storeId: store.id, secrets: await store.readAll() })));
}

/**
 * Merges the stores' secrets into one map: for a key in several stores the earlier store wins. An empty
 * value counts as absent, so it neither wins nor blocks a later store.
 * @util
 */
export function mergeStores(read: StoreSecrets[]): Map<string, string> {
    const merged = new Map<string, string>();
    for (const { secrets } of read) {
        for (const [key, value] of secrets) {
            if (value && !merged.has(key)) {
                merged.set(key, value);
            }
        }
    }

    return merged;
}
