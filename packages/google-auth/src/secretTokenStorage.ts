import type { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import type { SecretsProvider } from '@nzyme/secrets/commands/SecretsCommandsOptions.js';
import type { SecretDefinition } from '@nzyme/secrets/defineSecret.js';
import { resolveSecretTarget } from '@nzyme/secrets/resolveSecretTarget.js';
import { mergeStores, readStores } from '@nzyme/secrets/utils/readStores.js';

import type { GoogleTokenStorage } from './GoogleTokenStorage.js';

/** Params of {@link secretTokenStorage}. */
export interface SecretTokenStorageParams {
    provider: SecretsProvider;
    /** The declared token secret. */
    secret: SecretDefinition;
    /** The environment the declarations' `enabled` conditions are evaluated in. */
    env: EnvVariables;
}

/**
 * The token dictionary in a secret of the provider. Reads the merged view of its stores, as every
 * secret is read (an environment variable of the same name does not override it); writes through
 * `resolveSecretTarget`, so a secret the provider does not declare is refused before anything is
 * written.
 * @__NO_SIDE_EFFECTS__
 */
export function secretTokenStorage({ provider, secret, env }: SecretTokenStorageParams): GoogleTokenStorage {
    const { name } = secret;
    return { read, write };

    async function read() {
        return mergeStores(await readStores(provider.stores)).get(name);
    }

    async function write(value: string) {
        const store = resolveSecretTarget({ provider, env, name });
        await store.write([{ key: name, value }]);
    }
}
