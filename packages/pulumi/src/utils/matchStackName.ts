/**
 * Matches a stack name against a CLI pattern. Two wildcards are supported:
 * - `*` — any sequence of characters (e.g. `*-eu-central-1`, `database-*`).
 * - `+` — legacy wildcard, equivalent to `*` (kept for existing scripts).
 *
 * All other regex metacharacters are escaped, so a pattern is matched literally except for its
 * wildcards. A pattern with no wildcard is an exact-equality check.
 * @__NO_SIDE_EFFECTS__
 */
export function matchStackName(pattern: string, stackName: string): boolean {
    if (!pattern.includes('*') && !pattern.includes('+')) {
        return stackName === pattern;
    }

    // Escape regex specials EXCEPT the wildcards `*` and `+`, then expand the wildcards.
    const source = pattern
        .replace(/[.?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\+/g, '.+');

    return new RegExp(`^${source}$`).test(stackName);
}
