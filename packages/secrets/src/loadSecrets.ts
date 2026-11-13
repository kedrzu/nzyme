import type { Container } from '@nzyme/ioc/Container.js';
import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import { Logger } from '@nzyme/logging/Logger.js';
import { LoggerTransport } from '@nzyme/logging/LoggerTransport.js';

import { mergeStores, readStores } from './utils/readStores.js';
import type { SecretStore } from './SecretStore.js';

/**
 * Loads every secret of `stores` into the container's `EnvVariables`, so that `defineEnvVariable`
 * resolves them by the secret's key. Run it at startup, before resolving anything that reads those
 * variables. For a repo with a config document, use `secretsSource` instead.
 *
 * Every read completes before anything is written: when any read fails it throws and `EnvVariables`
 * is left untouched. For a key in several stores the earlier store wins. A non-empty variable already
 * set wins over its secret. Errors and logs carry names and store ids, never values. The
 * `Secrets loaded` log lists the names loaded and the names left to an already-set variable
 * (`overridden`).
 *
 * A plain function rather than a command, because a scopeless command resolves its dependencies
 * on the root container, while this must work on any container.
 */
export async function loadSecrets(container: Container, stores: SecretStore[]): Promise<void> {
    const env = container.resolve(EnvVariables);
    const merged = mergeStores(await readStores(stores));

    const loaded: string[] = [];
    const overridden: string[] = [];
    for (const [name, value] of merged) {
        if (env[name]) {
            overridden.push(name);
        } else {
            env[name] = value;
            loaded.push(name);
        }
    }

    const logger = Logger.create({ name: 'Secrets', transport: container.resolve(LoggerTransport) });
    logger.info('Secrets loaded', { loaded, overridden });
}
