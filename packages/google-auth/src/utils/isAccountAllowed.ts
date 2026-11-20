import { matchesGlob } from './matchesGlob.js';

/**
 * Whether the project's `accounts` allowlist (emails or `*` globs, case-insensitive) lets it use
 * `email`. Unset allows every account; an empty list allows none.
 * @util
 * @__NO_SIDE_EFFECTS__
 */
export function isAccountAllowed(email: string, accounts: string[] | undefined) {
    return accounts?.some(pattern => matchesGlob(email, pattern)) ?? true;
}
