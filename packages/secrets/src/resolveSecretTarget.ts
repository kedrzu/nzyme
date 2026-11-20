import { UsageError } from '@nzyme/cli-core';
import type { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';

import { getSecretDeclarations, getUndeclaredReason } from './commands/utils/getSecretDeclarations.js';
import type { SecretsProvider } from './commands/SecretsCommandsOptions.js';
import type { SecretStore } from './SecretStore.js';

/** Params of {@link resolveSecretTarget}. */
export interface ResolveSecretTargetParams {
    provider: SecretsProvider;
    /** The environment `enabled` conditions of the declarations are evaluated in. */
    env: EnvVariables;
    /** The secret to write. */
    name: string;
}

/**
 * The store to write the secret `name` to: the one write path of `secrets set` and of any code that stores a
 * secret itself. When the provider declares its secrets, throws a `UsageError` for a name that is not declared
 * or not enabled in `env`; then asks the provider's `target`. Call it before prompting for a value.
 */
export function resolveSecretTarget(params: ResolveSecretTargetParams): SecretStore {
    const { provider, env, name } = params;
    if (provider.secrets) {
        const reason = getUndeclaredReason(getSecretDeclarations(provider.secrets, env), name);
        if (reason) {
            throw new UsageError(`Refusing to write ${name}: ${reason}.`);
        }
    }

    return provider.target(name);
}
