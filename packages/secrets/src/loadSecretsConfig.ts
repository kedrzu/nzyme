import { envSource } from '@nzyme/config/envSource.js';
import { loadConfig } from '@nzyme/config/loadConfig.js';
import type { Container } from '@nzyme/ioc/Container.js';
import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';

import type { SecretStore } from './SecretStore.js';
import { secretsSource } from './secretsSource.js';

/**
 * Installs the container's config document for a process that reads its secrets itself (a Bun script, a CLI
 * command): the container's environment variables, then every store, so a variable set in the shell wins over a
 * stored secret and an earlier store over a later one. Code then resolves each secret through the container.
 *
 * With `CI` set the stores are not read: a CI job carries its secrets as environment variables, and has no
 * keychain or store credentials of a developer. A runtime with no store access (a Worker, a Nitro server)
 * calls `loadConfig` itself with what its platform hands it.
 */
export async function loadSecretsConfig(container: Container, stores: readonly SecretStore[]): Promise<void> {
    const env = container.resolve(EnvVariables);
    await loadConfig(container, env.CI ? [envSource(env)] : [envSource(env), ...stores.map(secretsSource)]);
}
