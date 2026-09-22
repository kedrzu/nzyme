import { assertValue } from '@nzyme/utils';

/**
 * Verdict of {@link pickSubmoduleBranch}: which branch, if any, a submodule's gitlink SHA belongs
 * to once the caller's base branches are discarded from the set of remotes that contain it.
 */
export type PickSubmoduleBranchResult =
    /**
     * No candidate remains once base branches are discarded — the SHA is reachable only from a
     * base branch, so the submodule has nothing task-specific to sit on.
     */
    | { kind: 'base' }
    /**
     * Exactly one non-base candidate remains — the branch the submodule belongs on.
     */
    | { kind: 'branch'; name: string }
    /**
     * More than one non-base candidate remains. The caller must refuse rather than choose one:
     * picking a branch here would silently attach the submodule's state to the wrong task.
     */
    | { kind: 'ambiguous'; candidates: string[] };

/**
 * Inputs to {@link pickSubmoduleBranch}.
 */
export interface PickSubmoduleBranchParams {
    /**
     * Remote branch names that contain the SHA in question, already normalised by the caller —
     * no `origin/` prefix, no `HEAD -> ...` line from `git branch -r`. This function does no
     * parsing of raw git output; it only classifies an already-clean list.
     */
    candidates: string[];

    /**
     * Branches that count as "base" for the caller's project (e.g. `['main', 'release']`).
     * Supplied by the caller — this package is generic and must never hardcode a project's own
     * branch naming.
     */
    baseBranches: string[];
}

/**
 * Classify the remote branches a submodule's gitlink SHA is reachable from into a verdict about
 * which branch the submodule belongs on.
 *
 * The only reliable link between a Linear task and a submodule commit is the gitlink SHA itself —
 * there is no naming convention to rely on, and the submodule's own branch names are none of the
 * main repo's business. `git branch -r --contains <sha>` gives every remote branch the commit is
 * reachable from; discarding the base branches from that list leaves either nothing (the commit
 * never left base), one branch (an unambiguous answer), or more than one (a genuine conflict that
 * no automated pick can resolve safely, since the two branches are, by definition, different
 * tasks).
 * @param params The candidate branches and the caller's base-branch list.
 * @returns The base/branch/ambiguous verdict.
 * @__NO_SIDE_EFFECTS__
 */
export function pickSubmoduleBranch(params: PickSubmoduleBranchParams): PickSubmoduleBranchResult {
    const { candidates, baseBranches } = params;
    const taskCandidates = candidates.filter(candidate => !baseBranches.includes(candidate));

    if (taskCandidates.length === 0) {
        return { kind: 'base' };
    }

    if (taskCandidates.length === 1) {
        return { kind: 'branch', name: assertValue(taskCandidates[0], 'unreachable: length checked above') };
    }

    return { kind: 'ambiguous', candidates: taskCandidates };
}
