import { assertNever } from '@nzyme/utils';

/**
 * The state of a submodule branch's pull request, as discovered by the caller via
 * `findOpenPrForBranch`/`findMergedPrForBranch`. Meaningless (and ignored) while on a base branch.
 */
export type SubmodulePrStatus =
    /**
     * No pull request exists for the branch yet.
     */
    | { status: 'none' }
    /**
     * A pull request is open for the branch.
     */
    | { status: 'open'; number: number }
    /**
     * The branch's pull request has already been merged into a base branch.
     */
    | { status: 'merged'; number: number };

/**
 * Inputs to {@link decideSubmoduleReadiness}.
 */
export interface DecideSubmoduleReadinessParams {
    /**
     * Display name of the submodule (e.g. `nzyme`), used to build the `reason`/`remedy` sentences
     * of a `refuse` verdict.
     */
    submoduleName: string;

    /**
     * The branch the submodule is effectively on. For an attached HEAD this is simply the current
     * branch. For a **detached** HEAD, the caller resolves it beforehand from the gitlink SHA
     * (`git branch -r --contains <sha>` narrowed by `pickSubmoduleBranch`) and passes the result
     * in — this function does no git work of its own, so it stays a pure table.
     *
     * `null` only for a detached HEAD whose commit the caller could not resolve to *any* remote
     * branch, not even a base one — the one shape a detached HEAD cannot be normalised away.
     */
    branchName: string | null;

    /**
     * Whether `branchName` (when not `null`) is one of the caller's base branches. Irrelevant
     * when `branchName` is `null`.
     */
    isBaseBranch: boolean;

    /**
     * The working tree has uncommitted changes.
     */
    isDirty: boolean;

    /**
     * `branchName` has local commits that are not yet on its origin remote.
     */
    hasUnpushedCommits: boolean;

    /**
     * The pull request state for `branchName`. Ignored while `isBaseBranch` is `true`.
     */
    pr: SubmodulePrStatus;
}

/**
 * Verdict of {@link decideSubmoduleReadiness}.
 */
export type SubmoduleReadiness =
    /**
     * The submodule may be used as-is: it is either on a clean, fully-pushed base branch, or on a
     * non-base branch with an open pull request.
     */
    | { kind: 'ready' }
    /**
     * The branch's work has already landed (its PR is merged) and nothing is left unsaved on it.
     * The caller should park the submodule back on its base branch — this function only reports
     * the verdict, it never mutates the checkout itself.
     */
    | { kind: 'park-on-base' }
    /**
     * The submodule is not safe to proceed with unattended. `reason` names what is wrong,
     * `remedy` names the concrete action — both are full sentences naming the submodule and
     * branch, meant to be surfaced verbatim in a `UsageError`.
     */
    | { kind: 'refuse'; reason: string; remedy: string };

/**
 * Decide whether a submodule is in a state safe to proceed with unattended, per the readiness
 * table: dirty working tree, unpushed commits, a non-base branch with no open PR, a non-base
 * branch whose PR has already merged, a detached HEAD unresolvable to any remote branch, and a
 * clean base branch.
 *
 * Unsaved work is checked before anything else, in the order it is most destructive to miss: a
 * detached HEAD reachable from no remote branch at all means the work exists **only** in this one
 * checkout, so that is decided first. A merged PR gets its own message ahead of the generic
 * dirty/unpushed checks — pushing more commits to an already-merged branch, or asking for it to be
 * pushed, is the wrong instruction; the real remedy is to start a new branch, so that combination
 * is decided as its own case rather than falling through to the generic wording. Everywhere else,
 * dirty and unpushed are checked before branch-specific nudges like "open a PR", because losing
 * uncommitted or unpushed work is worse than an unopened PR.
 * @param params The resolved state of the submodule to judge.
 * @returns Whether the submodule is ready, should be parked on base, or must be refused.
 * @__NO_SIDE_EFFECTS__
 */
export function decideSubmoduleReadiness(params: DecideSubmoduleReadinessParams): SubmoduleReadiness {
    const { submoduleName, branchName, isBaseBranch, isDirty, hasUnpushedCommits, pr } = params;

    if (branchName === null) {
        return {
            kind: 'refuse',
            reason: `${submoduleName}'s HEAD is detached and its commit is not reachable from any remote branch.`,
            remedy: `Push the commit to a branch in ${submoduleName} so the work exists somewhere other than this checkout.`,
        };
    }

    if (isBaseBranch) {
        if (isDirty) {
            return dirtyRefusal(submoduleName, branchName);
        }

        if (hasUnpushedCommits) {
            return unpushedRefusal(submoduleName, branchName);
        }

        return { kind: 'ready' };
    }

    if (pr.status === 'merged') {
        if (isDirty || hasUnpushedCommits) {
            return {
                kind: 'refuse',
                reason: `${submoduleName}'s PR #${pr.number} for ${branchName} is already merged, and ${branchName} still carries additional work.`,
                remedy: `Start a new branch in ${submoduleName} for that work — ${branchName} is done.`,
            };
        }

        return { kind: 'park-on-base' };
    }

    if (isDirty) {
        return dirtyRefusal(submoduleName, branchName);
    }

    if (hasUnpushedCommits) {
        return unpushedRefusal(submoduleName, branchName);
    }

    switch (pr.status) {
        case 'open':
            return { kind: 'ready' };
        case 'none':
            return {
                kind: 'refuse',
                reason: `${submoduleName} is on ${branchName}, which has no open pull request.`,
                remedy: `Open a pull request for ${branchName} in ${submoduleName}.`,
            };
        default:
            return assertNever(pr, 'Unhandled submodule PR status');
    }
}

function dirtyRefusal(submoduleName: string, branchName: string): SubmoduleReadiness {
    return {
        kind: 'refuse',
        reason: `${submoduleName} has uncommitted changes on ${branchName}.`,
        remedy: `Commit them in ${submoduleName} using Conventional Commits, then push ${branchName}.`,
    };
}

function unpushedRefusal(submoduleName: string, branchName: string): SubmoduleReadiness {
    return {
        kind: 'refuse',
        reason: `${submoduleName} has commits on ${branchName} that are not on its origin remote.`,
        remedy: `Push ${branchName} in ${submoduleName}.`,
    };
}
