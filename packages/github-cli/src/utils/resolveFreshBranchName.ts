import { determineNextVersion } from './branchVersionHelpers.js';
import { findReusableTaskBranch, listTaskBranches } from './listTaskBranches.js';

/**
 * Parameters for resolving the name of a task's fresh branch.
 */
export interface ResolveFreshBranchNameParams {
    /**
     * The task's unversioned branch name (e.g. Linear's `branchName`).
     */
    branchName: string;

    /**
     * Repository to inspect. Defaults to the current directory.
     */
    baseDir?: string;
}

/**
 * Pick the name for a task's new branch when it has no pull request, open or closed.
 *
 * When HEAD already is one of the task's branches, it is reused, so re-running after a push whose
 * PR creation failed carries on with that branch. Otherwise the plain name is used while nothing in
 * git carries it - the first run of a task. Failing both, an earlier run left it behind (possibly
 * checked out in another worktree, possibly only on the remote) and the next free `--vN` is
 * returned, so the new branch can be cut from the base and pushed without colliding.
 */
export async function resolveFreshBranchName(params: ResolveFreshBranchNameParams): Promise<string> {
    const { branchName, baseDir } = params;

    const taskBranches = await listTaskBranches({ branchName, baseDir });
    const reusable = await findReusableTaskBranch({ taskBranches, prBranches: [], baseDir });
    if (reusable) {
        return reusable;
    }

    if (!taskBranches.includes(branchName)) {
        return branchName;
    }

    return determineNextVersion(branchName, taskBranches);
}
