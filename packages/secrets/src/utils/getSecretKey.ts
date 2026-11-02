import type { SecretRef } from '../SecretStore.js';

/**
 * The store key of a mapped secret: the ref's own key, or else the environment variable name it is
 * mapped to.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function getSecretKey(name: string, ref: SecretRef): string {
    return ref.key ?? name;
}
