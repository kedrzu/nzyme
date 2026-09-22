import { simpleGit } from 'simple-git';
import type { SimpleGit } from 'simple-git';

import { UsageError } from '@nzyme/cli';
import { assertValue } from '@nzyme/utils';

import type { GithubConfig } from '../GithubConfig.js';
import type { GithubClient } from './createGithubClient.js';
import { decideSubmoduleReadiness } from './decideSubmoduleReadiness.js';
import type { SubmodulePrStatus, SubmoduleReadiness } from './decideSubmoduleReadiness.js';
import { findMergedPrForBranch, findOpenPrForBranch } from './findMatchingPr.js';
import type { SubmoduleInfo } from './getSubmoduleInfo.js';
import { parseContainingBranches, resolveSubmoduleBranch } from './resolveSubmoduleBranch.js';

/**
 * Inputs to {@link assertSubmoduleReady}.
 */
export interface AssertSubmoduleReadyParams {
    /**
     * The submodule to check, as returned by `getSubmoduleInfo()`. One call checks one submodule
     * — every caller already loops over that function's result to act on each submodule in turn,
     * so looping inside this function too would only move the loop, not remove it.
     */
    submodule: SubmoduleInfo;

    /**
     * Branches that count as "base" for the caller's project (e.g. `['main', 'release']`).
     * Supplied by the caller — this package is generic and must never hardcode a project's own
     * branch naming.
     */
    baseBranches: string[];

    /**
     * GitHub client used to look up the submodule's own pull request when it is off a base
     * branch. Left unused (no API call made) while the submodule resolves onto a base branch.
     */
    githubClient: GithubClient;

    /**
     * GitHub configuration for the submodule's OWN repository — not the main repository's. The
     * caller derives this from `getSubmoduleGithubConfig(submodule.url, ...)` before calling.
     */
    githubConfig: GithubConfig;
}

/**
 * Verify that a submodule is safe to proceed with unattended, per the readiness table in
 * `docs/decisions/submodule-branch-resolved-from-gitlink-sha.md`: a clean, fully-pushed base
 * branch or a non-base branch with an open pull request is ready; a non-base branch whose pull
 * request already merged and carries nothing further is reported for the caller to park on base;
 * every other shape refuses.
 *
 * This function performs **no mutation** — no checkout, no commit, no push, and no fetch that
 * moves a ref. That is deliberate: its intended guard slot (between `assertMainRepoClean` and
 * `checkoutBottomNode` in `mergeTaskPrs`) must stay free of anything that touches a working tree.
 * `park-on-base` is reported rather than acted on — the caller runs `parkSubmoduleOnBase` itself,
 * at the point where the resulting gitlink change has somewhere to land.
 *
 * Normalises the submodule's raw state into {@link decideSubmoduleReadiness}'s pure table: an
 * attached HEAD uses its current branch as-is; a detached HEAD — the ordinary state for a
 * gitlink-pinned submodule — is resolved from its commit via {@link resolveSubmoduleBranch}, with
 * the one shape that function cannot see on its own (a commit on no remote branch at all) caught
 * first, against the unfiltered candidate list.
 * @param params The submodule to check, plus the base-branch list and GitHub access needed to
 * look up its pull request.
 * @returns The verdict when the submodule is ready, or should be parked on its base branch.
 * @throws {UsageError} When the submodule is not safe to proceed with — the message names the
 * submodule, its branch, and the remedy.
 */
export async function assertSubmoduleReady(params: AssertSubmoduleReadyParams): Promise<SubmoduleReadiness> {
    const { submodule, baseBranches, githubClient, githubConfig } = params;
    const git = simpleGit({ baseDir: submodule.path });

    const effective = await resolveEffectiveBranch({ git, submodule, baseBranches });
    const pr = await resolvePrStatus({
        githubClient,
        githubConfig,
        branchName: effective.branchName,
        isBaseBranch: effective.isBaseBranch,
    });

    const readiness = decideSubmoduleReadiness({
        submoduleName: submodule.name,
        branchName: effective.branchName,
        isBaseBranch: effective.isBaseBranch,
        isDirty: submodule.hasChanges,
        hasUnpushedCommits: effective.hasUnpushedCommits,
        pr,
    });

    if (readiness.kind === 'refuse') {
        throw new UsageError(`${readiness.reason} ${readiness.remedy}`);
    }

    return readiness;
}

/**
 * The branch a submodule is effectively on, normalised for {@link decideSubmoduleReadiness}.
 */
interface EffectiveSubmoduleBranch {
    /**
     * See `DecideSubmoduleReadinessParams.branchName`.
     */
    branchName: string | null;

    /**
     * See `DecideSubmoduleReadinessParams.isBaseBranch`.
     */
    isBaseBranch: boolean;

    /**
     * See `DecideSubmoduleReadinessParams.hasUnpushedCommits`.
     */
    hasUnpushedCommits: boolean;
}

/**
 * Inputs to {@link resolveEffectiveBranch}.
 */
interface ResolveEffectiveBranchParams {
    /**
     * Git instance scoped to the submodule working tree.
     */
    git: SimpleGit;

    /**
     * The submodule being checked.
     */
    submodule: SubmoduleInfo;

    /**
     * The caller's base-branch list, forwarded to {@link resolveSubmoduleBranch}.
     */
    baseBranches: string[];
}

/**
 * Normalise an attached-or-detached submodule HEAD into the branch {@link decideSubmoduleReadiness}
 * should judge. An attached HEAD is already on a real branch, so its `SubmoduleInfo` fields are
 * used as-is. A detached HEAD — the ordinary state for a gitlink-pinned submodule — needs
 * resolving from its commit; see {@link resolveDetachedBranch}.
 */
async function resolveEffectiveBranch(params: ResolveEffectiveBranchParams): Promise<EffectiveSubmoduleBranch> {
    const { git, submodule, baseBranches } = params;

    if (!submodule.detached) {
        const branchName = assertValue(
            submodule.currentBranch,
            `${submodule.name} is not detached but reports no current branch`,
        );

        return {
            branchName,
            isBaseBranch: baseBranches.includes(branchName),
            // `unpushedCommitsCount` is computed only when `currentBranch` is set (see
            // `getSubmoduleInfo`), which is exactly the branch of this `if` — safe to read here.
            hasUnpushedCommits: submodule.unpushedCommitsCount > 0,
        };
    }

    return resolveDetachedBranch({ git, submodule, baseBranches });
}

/**
 * Resolve a detached HEAD's effective branch from its own commit, mirroring
 * {@link resolveSubmoduleBranch} but adding the one case that function cannot see by itself: a
 * commit on no remote branch at all. `resolveSubmoduleBranch` reports `{ kind: 'base' }` both when
 * the commit is only on a base branch AND when it is on nothing whatsoever — both collapse to zero
 * non-base candidates — so the unfiltered candidate list is inspected here first, exactly the way
 * `parkSubmoduleOnBase`'s `isOnAnyRemoteBranch` guard does for the same reason.
 */
async function resolveDetachedBranch(params: ResolveEffectiveBranchParams): Promise<EffectiveSubmoduleBranch> {
    const { git, submodule, baseBranches } = params;

    const sha = (await git.revparse(['HEAD'])).trim();
    const rawOutput = await git.raw(['branch', '-r', '--contains', sha]);
    const candidates = parseContainingBranches(rawOutput);

    if (candidates.length === 0) {
        // The commit exists nowhere but this one checkout — the most destructive shape in the
        // table. `decideSubmoduleReadiness` refuses unconditionally on a `null` branchName, so the
        // other fields below are never read.
        return { branchName: null, isBaseBranch: false, hasUnpushedCommits: false };
    }

    const verdict = await resolveSubmoduleBranch({
        git,
        sha,
        baseBranches,
        repoDisplayName: submodule.name,
    });

    if (verdict.kind === 'branch') {
        // Resolved to a specific remote branch: the commit IS that branch's (or an ancestor's)
        // pushed tip, and a detached HEAD carries no local commits layered on top of it — there is
        // nothing left to be "unpushed".
        return { branchName: verdict.name, isBaseBranch: false, hasUnpushedCommits: false };
    }

    // `verdict.kind === 'base'`: `candidates` is non-empty (checked above) and
    // `pickSubmoduleBranch` only returns `base` when every candidate is a base branch, so one is
    // guaranteed to be found here.
    const baseBranchName = assertValue(
        candidates.find(candidate => baseBranches.includes(candidate)),
        'unreachable: resolveSubmoduleBranch returned base, so a base-branch candidate must exist',
    );

    return { branchName: baseBranchName, isBaseBranch: true, hasUnpushedCommits: false };
}

/**
 * Inputs to {@link resolvePrStatus}.
 */
interface ResolvePrStatusParams {
    /**
     * GitHub client for the submodule's own repository.
     */
    githubClient: GithubClient;

    /**
     * GitHub configuration for the submodule's own repository.
     */
    githubConfig: GithubConfig;

    /**
     * The submodule's effective branch, as resolved by {@link resolveEffectiveBranch}.
     */
    branchName: string | null;

    /**
     * Whether `branchName` is one of the caller's base branches.
     */
    isBaseBranch: boolean;
}

/**
 * Look up the pull request for a submodule's non-base branch: open first, then merged.
 * {@link decideSubmoduleReadiness} ignores `pr` while on a base branch (and always refuses a
 * `null` branchName before reading it), so this skips the GitHub round trip in both cases rather
 * than spending an API call on a result nothing will use.
 */
async function resolvePrStatus(params: ResolvePrStatusParams): Promise<SubmodulePrStatus> {
    const { githubClient, githubConfig, branchName, isBaseBranch } = params;

    if (branchName === null || isBaseBranch) {
        return { status: 'none' };
    }

    const openPr = await findOpenPrForBranch(githubClient, githubConfig, branchName);
    if (openPr) {
        return { status: 'open', number: openPr.number };
    }

    const mergedPr = await findMergedPrForBranch(githubClient, githubConfig, branchName);
    if (mergedPr) {
        return { status: 'merged', number: mergedPr.number };
    }

    return { status: 'none' };
}
