import { getSecretKey } from './getSecretKey.js';
import type { SecretRef, SecretStore } from '../SecretStore.js';

/**
 * A mapped secret with its store key resolved.
 */
export interface StoreSecret {
    /** The environment variable name it is mapped to. */
    name: string;
    key: string;
}

/**
 * Groups mapped secrets by their store, so each store can be called once for all its keys. Several
 * names may share a key.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function groupSecretsByStore(secrets: Record<string, SecretRef>): Map<SecretStore, StoreSecret[]> {
    const byStore = new Map<SecretStore, StoreSecret[]>();

    for (const [name, ref] of Object.entries(secrets)) {
        let entries = byStore.get(ref.store);
        if (!entries) {
            entries = [];
            byStore.set(ref.store, entries);
        }

        entries.push({ name, key: getSecretKey(name, ref) });
    }

    return byStore;
}
