import type { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';

import { groupSecretsByStore } from './groupSecretsByStore.js';
import type { SecretsMapping } from './SecretsProvider.js';
import type { SecretRef } from './SecretStore.js';

/**
 * A mapped secret its store does not have, or has empty.
 */
export interface MissingSecret {
    /** The environment variable name it is mapped to. */
    name: string;
    storeId: string;
    key: string;
}

/**
 * Describes missing secrets for an error message: each name with its key and store, and how to
 * store them. Never a value.
 */
export function describeMissingSecrets(missing: MissingSecret[]): string {
    const list = missing.map(secret => `${secret.name} (key ${secret.key} in store ${secret.storeId})`);
    return `${list.join(', ')}. Store them with \`secrets set <NAME>\`.`;
}

/**
 * The outcome of {@link resolveSecrets}.
 */
export interface ResolvedSecrets {
    /** Fetched values by environment variable name; only names neither missing nor overridden. */
    values: Map<string, string>;
    missing: MissingSecret[];
    /** Names already set (non-empty) in the environment; they win, so their secrets are not read. */
    overridden: string[];
}

/**
 * Reads the mapped secrets, one `read` per store however many secrets it holds. An empty value
 * counts as missing. Prints nothing and writes nothing: the caller decides what to do with the result.
 */
export async function resolveSecrets(mapping: SecretsMapping, env: EnvVariables): Promise<ResolvedSecrets> {
    const overridden: string[] = [];
    const wanted: Record<string, SecretRef> = {};

    for (const [name, ref] of Object.entries(mapping.secrets)) {
        if (env[name]) {
            overridden.push(name);
        } else {
            wanted[name] = ref;
        }
    }

    const byStore = groupSecretsByStore(wanted);
    const reads = await Promise.all(
        Array.from(byStore, async ([store, entries]) => {
            const keys = [...new Set(entries.map(entry => entry.key))];
            const found = await store.read(keys);
            return { store, entries, found };
        }),
    );

    const values = new Map<string, string>();
    const missing: MissingSecret[] = [];

    for (const { store, entries, found } of reads) {
        for (const { name, key } of entries) {
            const value = found.get(key);
            if (value) {
                values.set(name, value);
            } else {
                missing.push({ name, storeId: store.id, key });
            }
        }
    }

    return { values, missing, overridden };
}
