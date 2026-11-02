import type { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';

import type { SecretsMapping } from '../SecretsMapping.js';

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
 * @util
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
 * Reads the mapped secrets in one `read` of the mapping's store. An empty value counts as missing.
 * Prints nothing and writes nothing: the caller decides what to do with the result.
 * @util
 */
export async function resolveSecrets(mapping: SecretsMapping, env: EnvVariables): Promise<ResolvedSecrets> {
    const overridden: string[] = [];
    const wanted: [name: string, key: string][] = [];

    for (const [name, key] of Object.entries(mapping.secrets)) {
        if (env[name]) {
            overridden.push(name);
        } else {
            wanted.push([name, key]);
        }
    }

    const values = new Map<string, string>();
    const missing: MissingSecret[] = [];
    if (wanted.length === 0) {
        return { values, missing, overridden };
    }

    const { store } = mapping;
    const found = await store.read([...new Set(wanted.map(([, key]) => key))]);
    for (const [name, key] of wanted) {
        const value = found.get(key);
        if (value) {
            values.set(name, value);
        } else {
            missing.push({ name, storeId: store.id, key });
        }
    }

    return { values, missing, overridden };
}
