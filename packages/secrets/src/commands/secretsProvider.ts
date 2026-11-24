import type { SecretDefinition } from '../defineSecret.js';
import type { SecretStore } from '../SecretStore.js';
import type { SecretsProvider } from './SecretsCommandsOptions.js';

/** Params of {@link secretsProvider}. */
export interface SecretsProviderParams {
    /** The project's declared secrets, usually `getSecretDefinitions(secretsModule)`. */
    secrets: readonly SecretDefinition[];
    /** The one store every secret is read from and written to. */
    store: SecretStore;
}

/**
 * The `SecretsProvider` of a project whose secrets live in one store. A project with several stores
 * composes them into one `SecretStore` of its own, or writes its provider by hand.
 * @__NO_SIDE_EFFECTS__
 */
export function secretsProvider(params: SecretsProviderParams): SecretsProvider {
    const { secrets, store } = params;
    return { stores: [store], target: () => store, secrets };
}
