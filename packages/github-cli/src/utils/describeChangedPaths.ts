import { assertValue } from '@nzyme/utils';

/**
 * Number of directory groups named explicitly before the rest collapse into "and N more". Three
 * is enough to give a reviewer the shape of a change (e.g. "docs, src/api and src/utils") without
 * a subject line that grows with the file count.
 */
const MAX_GROUPS = 3;

/**
 * Maximum length of the returned description. A git commit subject line is conventionally kept
 * under ~72 characters, and callers of this function prepend their own context first (e.g.
 * `'Fixes after review: '`), so the description alone is capped well below that to leave room for
 * the prefix without wrapping the subject onto a second line.
 */
const MAX_DESCRIPTION_LENGTH = 50;

/**
 * Marker appended when a description had to be shortened to fit {@link MAX_DESCRIPTION_LENGTH}.
 */
const TRUNCATION_SUFFIX = '…';

/**
 * Describe a set of changed file paths as a short, human-readable summary — the heuristic behind
 * generating commit messages without an LLM.
 *
 * Deliberately pure and git-free: given the same paths, in any order, it always returns the same
 * string, so a caller can compute it directly from a `git status` result with no extra git call.
 * @param paths Every changed path (e.g. `GitStatusInfo.changedPaths` from `getGitStatusInfo`).
 * Order does not matter — the result is sorted internally so it stays stable across runs.
 * @returns A single path when only one changed, a shared directory when several paths live under
 * it, a capped "a, b and N more" list of directories otherwise, or `null` when there is nothing to
 * describe — callers fall back to their own default commit message in that case.
 * @__NO_SIDE_EFFECTS__
 */
export function describeChangedPaths(paths: string[]): string | null {
    if (paths.length === 0) {
        return null;
    }

    if (paths.length === 1) {
        return capLength(assertValue(paths[0], 'unreachable: length checked above'));
    }

    const groups = groupByDirectory(paths);

    if (groups.length === 1) {
        return capLength(assertValue(groups[0], 'unreachable: length checked above'));
    }

    return capLength(joinWithMore(groups));
}

/**
 * Reduce every path to the directory it lives in, deduplicated and sorted so the grouping — and
 * therefore the final message — never depends on the order `git status` happened to report.
 */
function groupByDirectory(paths: string[]): string[] {
    return [...new Set(paths.map(directoryLabel))].toSorted();
}

/**
 * The directory a path lives in, for grouping purposes.
 *
 * A path with no `/` sits at the repository root, which has no directory name worth showing —
 * grouping it under e.g. `'.'` would read like a typo. It stands as its own group (its own file
 * name) instead, which also means distinct root-level files never collapse into a single fake
 * "root directory" group.
 */
function directoryLabel(path: string): string {
    const separatorIndex = path.lastIndexOf('/');
    return separatorIndex === -1 ? path : path.slice(0, separatorIndex);
}

/**
 * Join directory groups into a natural-language list, capping how many are named explicitly.
 * Assumes at least two groups — the single-group case is handled by the caller.
 */
function joinWithMore(groups: string[]): string {
    const shown = groups.slice(0, MAX_GROUPS);
    const remaining = groups.length - shown.length;

    if (remaining > 0) {
        return `${shown.join(', ')} and ${remaining} more`;
    }

    // Every group fits within the cap: list them all in natural "a, b and c" form.
    const last = assertValue(shown.at(-1), 'unreachable: groups.length > 1 keeps at least two shown');
    const head = shown.slice(0, -1);
    return `${head.join(', ')} and ${last}`;
}

/**
 * Truncate a description to {@link MAX_DESCRIPTION_LENGTH}, so no combination of paths can produce
 * a subject line that wraps.
 */
function capLength(description: string): string {
    if (description.length <= MAX_DESCRIPTION_LENGTH) {
        return description;
    }

    return `${description.slice(0, MAX_DESCRIPTION_LENGTH - TRUNCATION_SUFFIX.length)}${TRUNCATION_SUFFIX}`;
}
