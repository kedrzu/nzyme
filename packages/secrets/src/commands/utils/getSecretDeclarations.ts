import type { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';

import type { SecretDefinition } from '../../defineSecret.js';
import { isSecretEnabled } from '../../defineSecret.js';

/** A project's declared secret names, split by whether they are used in this environment. */
export interface SecretDeclarations {
    /** In declaration order. */
    enabled: string[];
    disabled: Set<string>;
}

/**
 * Splits the declared secrets by `isSecretEnabled` in `env`.
 * @__NO_SIDE_EFFECTS__
 */
export function getSecretDeclarations(secrets: readonly SecretDefinition[], env: EnvVariables): SecretDeclarations {
    const declarations: SecretDeclarations = { enabled: [], disabled: new Set() };
    for (const secret of secrets) {
        if (isSecretEnabled(secret, env)) {
            declarations.enabled.push(secret.name);
        } else {
            declarations.disabled.add(secret.name);
        }
    }

    return declarations;
}

/**
 * Why a command must not touch `name`: not declared, or not enabled here; `undefined` when it may.
 * @__NO_SIDE_EFFECTS__
 */
export function getUndeclaredReason(declarations: SecretDeclarations, name: string): string | undefined {
    if (declarations.disabled.has(name)) {
        return 'it is not enabled in this environment';
    }

    if (!declarations.enabled.includes(name)) {
        return 'it is not declared with defineSecret';
    }

    return undefined;
}
