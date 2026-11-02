import { defineInterface } from '@nzyme/ioc/Interface.js';

import type { SecretRef, SecretStore } from './SecretStore.js';

/**
 * A project's secrets configuration.
 */
export interface SecretsMapping {
    /** Store aliases, used by `import` and `login` even before any secret references them. */
    stores: Record<string, SecretStore>;
    /** Environment variable name to the secret it is loaded from. */
    secrets: Record<string, SecretRef>;
}

/**
 * The project's secrets configuration. A project declares a service with
 * `implements: SecretsProvider` and passes it to `loadSecrets` and `defineSecretsCommands`.
 */
export const SecretsProvider = defineInterface<SecretsMapping>({ name: 'SecretsProvider' });
