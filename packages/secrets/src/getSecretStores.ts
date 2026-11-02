import type { SecretsMapping } from './SecretsMapping.js';
import type { SecretStore } from './SecretStore.js';

/**
 * Every store of a mapping: the listed ones plus those only a secret references, each once.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function getSecretStores(mapping: SecretsMapping): SecretStore[] {
    const stores = new Set(Object.values(mapping.stores));
    for (const ref of Object.values(mapping.secrets)) {
        stores.add(ref.store);
    }

    return [...stores];
}
