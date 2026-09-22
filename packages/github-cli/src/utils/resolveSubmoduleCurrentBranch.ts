import { simpleGit } from 'simple-git';

import { assertValue } from '@nzyme/utils';

import type { SubmoduleInfo } from './getSubmoduleInfo.js';
import type { ResolveSubmoduleBranchResult } from './resolveSubmoduleBranch.js';
import { resolveSubmoduleBranch } from './resolveSubmoduleBranch.js';

/**
 * Parameters for {@link resolveSubmoduleCurrentBranch}.
 */
export interface ResolveSubmoduleCurrentBranchParams {
    /**
     * The submodule to resolve, as returned by `getSubmoduleInfo()`.
     */
    submodule: SubmoduleInfo;

    /**
     * Branches that count as "base" for the caller's project — see
     * `ResolveSubmoduleBranchParams.baseBranches`. Supplied by the caller: this package is generic
     * and must never hardcode a project's own branch naming.
     */
    baseBranches: string[];
}

/**
 * Resolve the branch a submodule's pull request should be looked up on, right now — whatever the
 * submodule happens to be doing locally. Shared by every caller that used to match a submodule's
 * PR by Linear issue ID and now matches on `head.ref` instead (see
 * `docs/decisions/submodule-branch-resolved-from-gitlink-sha.md`): an attached HEAD already names
 * its branch; a detached HEAD — the ordinary state for a gitlink-pinned submodule — is resolved
 * from its own commit via {@link resolveSubmoduleBranch}, fetching first so the commit's remote
 * branches are visible (mirrors `checkoutExistingBranch.ts`'s `checkoutSubmoduleBranch`, which
 * fetches for the same reason).
 *
 * Never treats a detached HEAD as "nothing to look up" — a submodule resting on a task branch this
 * checkout has not fetched yet would otherwise silently read as having no pull request, which is
 * exactly the regression this function exists to prevent.
 * @param params The submodule to resolve, plus the caller's base branches.
 * @returns `base` when the submodule carries no task-specific work right now, or `branch` naming
 * the branch its pull request (if any) lives on.
 */
export async function resolveSubmoduleCurrentBranch(
    params: ResolveSubmoduleCurrentBranchParams,
): Promise<ResolveSubmoduleBranchResult> {
    const { submodule, baseBranches } = params;

    if (!submodule.detached) {
        const branchName = assertValue(
            submodule.currentBranch,
            `${submodule.name} is not detached but reports no current branch`,
        );

        if (baseBranches.includes(branchName)) {
            return { kind: 'base' };
        }

        return { kind: 'branch', name: branchName };
    }

    const git = simpleGit({ baseDir: submodule.path });
    await git.fetch('origin');
    const sha = (await git.revparse(['HEAD'])).trim();

    return resolveSubmoduleBranch({ git, sha, baseBranches, repoDisplayName: submodule.name });
}
