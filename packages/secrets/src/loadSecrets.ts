import type { Container } from '@nzyme/ioc/Container.js';
import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import type { Injectable } from '@nzyme/ioc/Injectable.js';
import { Logger } from '@nzyme/logging/Logger.js';
import { LoggerTransport } from '@nzyme/logging/LoggerTransport.js';

import { describeMissingSecrets, resolveSecrets } from './utils/resolveSecrets.js';
import type { SecretsMapping } from './SecretsMapping.js';

/**
 * Loads the secrets mapped by `provider`, resolved from `container`, into the container's
 * `EnvVariables`, so that `defineEnvVariable` resolves them. Run it at startup, before resolving
 * anything that reads those variables.
 *
 * Every read completes before anything is written: when any secret is missing or any read fails,
 * it throws and `EnvVariables` is left untouched. A non-empty variable already set wins over its
 * secret. Errors and logs carry names and references, never values. The `Secrets loaded` log lists the
 * names loaded and the names left to an already-set variable (`overridden`).
 *
 * A plain function rather than a command, because a scopeless command resolves its dependencies
 * on the root container, while this must work on any container.
 */
export async function loadSecrets(container: Container, provider: Injectable<SecretsMapping>): Promise<void> {
    const mapping = container.resolve(provider);
    const env = container.resolve(EnvVariables);
    const { values, missing, overridden } = await resolveSecrets(mapping, env);

    if (missing.length > 0) {
        throw new Error(`Secrets missing or empty: ${describeMissingSecrets(missing)}`);
    }

    for (const [name, value] of values) {
        env[name] = value;
    }

    const loaded = [...values.keys()];
    // Named after the project's provider, the unit whose secrets these are.
    const logger = Logger.create({ name: provider.name, transport: container.resolve(LoggerTransport) });
    logger.info('Secrets loaded', { loaded, overridden });
}
