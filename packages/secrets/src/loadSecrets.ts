import type { Container } from '@nzyme/ioc/Container.js';
import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import { Logger } from '@nzyme/logging/Logger.js';

import { describeMissingSecrets, resolveSecrets } from './resolveSecrets.js';
import { SecretsProvider } from './SecretsProvider.js';

/**
 * The outcome of {@link loadSecrets}.
 */
export interface LoadSecretsResult {
    /** Names written to `EnvVariables`. */
    loaded: string[];
    /** Names already set in `EnvVariables`, which won over their secrets. */
    overridden: string[];
}

/**
 * Loads the secrets mapped by the container's `SecretsProvider` into its `EnvVariables`, so that
 * `defineEnvVariable` resolves them. Run it at startup, after registering the provider and before
 * resolving anything that reads those variables.
 *
 * Every read completes before anything is written: when any secret is missing or any read fails,
 * it throws and `EnvVariables` is left untouched. A non-empty variable already set wins over its
 * secret. Errors and logs carry names and references, never values.
 *
 * A plain function rather than a command, because a scopeless command resolves its dependencies
 * on the root container, while this must work on any container.
 */
export async function loadSecrets(container: Container): Promise<LoadSecretsResult> {
    const mapping = container.tryResolve(SecretsProvider);
    if (!mapping) {
        throw new Error(
            'No SecretsProvider is registered. Register a service declaring `implements: SecretsProvider` ' +
                'with `container.register()` before calling loadSecrets().',
        );
    }

    const env = container.resolve(EnvVariables);
    const { values, missing, overridden } = await resolveSecrets(mapping, env);

    if (missing.length > 0) {
        throw new Error(`Secrets missing or empty: ${describeMissingSecrets(missing)}`);
    }

    for (const [name, value] of values) {
        env[name] = value;
    }

    const loaded = [...values.keys()];
    // The interface as the caller names the logger after it.
    const logger = container.resolve(Logger, SecretsProvider);
    logger.info('Secrets loaded', { loaded, overridden });

    return { loaded, overridden };
}
