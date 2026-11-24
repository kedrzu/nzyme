import { isSecretDefinition } from './defineSecret.js';

/** What sets a secret definition apart from the other exports of a module. */
interface SecretMarker {
    readonly meta: { readonly secret: true };
}

/**
 * Every secret definition among a module's exports (`import * as secrets from './secrets.js'`), typed
 * with the project's own metadata.
 * @__NO_SIDE_EFFECTS__
 */
export function getSecretDefinitions<T>(module: Readonly<Record<string, T>>): Extract<T, SecretMarker>[] {
    return Object.values(module).filter(isSecretExport);
}

function isSecretExport<T>(value: T): value is Extract<T, SecretMarker> {
    return isSecretDefinition(value);
}
