import { UsageError } from '@nzyme/cli-core';

import type { SecretsMapping } from '../SecretsMapping.js';
import type { SecretStore } from '../SecretStore.js';

/**
 * A store picked by its alias.
 */
export interface SelectedSecretStore {
    alias: string;
    store: SecretStore;
}

/**
 * Picks the store a command acts on: the given alias, or the only listed store when there is one.
 * @util
 */
export function selectSecretStore(mapping: SecretsMapping, alias: string | undefined): SelectedSecretStore {
    const entries = Object.entries(mapping.stores);
    const aliases = entries.map(([name]) => name).join(', ');

    if (alias !== undefined) {
        const store = mapping.stores[alias];
        if (!store) {
            throw new UsageError(`Unknown store "${alias}". Stores: ${aliases || '(none)'}.`);
        }

        return { alias, store };
    }

    const [only, ...rest] = entries;
    if (!only) {
        throw new UsageError('The secrets mapping lists no stores.');
    }

    if (rest.length > 0) {
        throw new UsageError(`Several stores are listed; choose one of: ${aliases}.`);
    }

    return { alias: only[0], store: only[1] };
}
