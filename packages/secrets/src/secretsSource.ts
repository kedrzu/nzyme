import type { ConfigSource } from '@nzyme/config/ConfigSource.js';

import type { SecretStore } from './SecretStore.js';

/**
 * A secret store as a config source: `load` returns every secret under the store's prefix, by key.
 * Put it in a config document's sources like any other, e.g. after the environment so that an
 * environment variable wins over a stored secret.
 * @__NO_SIDE_EFFECTS__
 */
export function secretsSource(store: SecretStore): ConfigSource {
    return {
        name: `secrets:${store.id}`,
        async load() {
            return Object.fromEntries(await store.readAll());
        },
    };
}
