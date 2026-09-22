import type { SubmoduleReadiness } from './decideSubmoduleReadiness.js';

/**
 * Inputs to {@link decideSubmoduleOnTaskBranch}.
 */
export interface DecideSubmoduleOnTaskBranchParams {
    /**
     * What `assertSubmoduleReady` made of the submodule, or `null` when it could not be judged at
     * all — its remote is not a GitHub one, or a human was shown the refusal and allowed to carry
     * on anyway. Both mean the same thing here: nothing vouched for this submodule, so nothing may
     * be pushed to it.
     */
    readiness: SubmoduleReadiness | null;

    /**
     * The submodule's checked-out branch, `undefined` while its HEAD is detached.
     */
    currentBranch: string | undefined;

    /**
     * Whether the submodule's HEAD is detached — the ordinary state for a gitlink-pinned submodule.
     */
    detached: boolean;

    /**
     * The caller's base branches. Supplied by the caller rather than derived from the merge source:
     * on a stacked task the merge source is a node branch, so reading "is this a base branch" from
     * it would classify a submodule sitting on the trunk as task work.
     */
    baseBranches: string[];
}

/**
 * Decide whether a submodule carries this task's work, and may therefore have the base branch
 * merged into it and be pushed.
 *
 * This is the gate in front of the only step of a sync that writes to a submodule's remote, so it
 * is deliberately conservative on every axis at once:
 *
 * - **Readiness, not branch shape.** The predecessor of this function matched the branch name
 *   against `[A-Z]+-\d+`, which says nothing about whether the branch belongs to the task — a
 *   branch someone happened to leave the submodule on could match and be pushed to. A `ready`
 *   verdict means the branch has an open pull request of its own, which is what actually ties it
 *   to work in flight.
 * - **Not a base branch.** A submodule resting on the trunk is ready, but merging the trunk into
 *   itself and pushing is not this function's business.
 * - **Not detached.** A detached HEAD has no branch to push, and gets parked on base earlier in
 *   the sync instead.
 * @param params The readiness verdict plus the submodule's branch state and the caller's bases.
 * @returns `true` only when the submodule is on its own task branch with work vouched for.
 * @__NO_SIDE_EFFECTS__
 */
export function decideSubmoduleOnTaskBranch(params: DecideSubmoduleOnTaskBranchParams): boolean {
    const { readiness, currentBranch, detached, baseBranches } = params;

    if (readiness === null || readiness.kind !== 'ready') {
        return false;
    }

    if (detached || !currentBranch) {
        return false;
    }

    return !baseBranches.includes(currentBranch);
}
