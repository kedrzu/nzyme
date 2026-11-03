import type { SecretStore } from './SecretStore.js';

/**
 * A project's secrets configuration. A project declares a service resolving to it,
 * `defineService<SecretsMapping>(…)`, and passes that service to `loadSecrets` and
 * `defineSecretsCommands`.
 */
export interface SecretsMapping {
    /** The one store every secret of the mapping is read from and written to. */
    store: SecretStore;
    /** Environment variable name to the key of its secret in the store. Several names may share a key. */
    secrets: Record<string, string>;
}
