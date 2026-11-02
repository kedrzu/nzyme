import type { SecretRef, SecretStore } from './SecretStore.js';

/**
 * A project's secrets configuration. A project declares a service resolving to it,
 * `defineService<SecretsMapping>(…)`, and passes that service to `loadSecrets` and
 * `defineSecretsCommands`.
 */
export interface SecretsMapping {
    /** Store aliases, used by `login` even before any secret references them. */
    stores: Record<string, SecretStore>;
    /** Environment variable name to the secret it is loaded from. */
    secrets: Record<string, SecretRef>;
}
