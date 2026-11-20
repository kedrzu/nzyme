import { simpleGit } from 'simple-git';

import { getBaseBranchName, stripNodeSuffix } from './branchVersionHelpers.js';

const LOCAL_PREFIX = 'refs/heads/';
const ORIGIN_PREFIX = 'refs/remotes/origin/';

/**
 * Parameters for listing a task's branches.
 */
export interface ListTaskBranchesParams {
    /**
     * Any branch of the task; its versions and stack nodes are all returned.
     */
    branchName: string;

    /**
     * Repository to inspect. Defaults to the current directory.
     */
    baseDir?: string;
}

/**
 * List every local and `origin` branch that belongs to the same task as `branchName` (same base
 * name, any `--vN` version, any `--sN` stack node), deduplicated.
 *
 * Fetches `origin` first: the pull request list only shows recent PRs, and a task branch left by an
 * earlier run may exist only in git - in a worktree that is still around or on the remote - so
 * stale remote refs would let a new branch collide with it.
 */
export async function listTaskBranches(params: ListTaskBranchesParams): Promise<string[]> {
    const { branchName, baseDir } = params;
    const git = simpleGit(baseDir);

    await git.fetch('origin');
    const refs = await git.raw(['for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes/origin']);

    const base = getBaseBranchName(branchName);
    const names = new Set<string>();
    for (const ref of refs.split('\n')) {
        const name = ref.startsWith(LOCAL_PREFIX)
            ? ref.slice(LOCAL_PREFIX.length)
            : ref.startsWith(ORIGIN_PREFIX)
              ? ref.slice(ORIGIN_PREFIX.length)
              : null;
        if (name && name !== 'HEAD' && getBaseBranchName(name) === base) {
            names.add(name);
        }
    }
    return [...names];
}

/**
 * Parameters for finding a task branch a run can reuse.
 */
export interface FindReusableTaskBranchParams {
    /**
     * Every branch of the task, as returned by {@link listTaskBranches}.
     */
    taskBranches: string[];

    /**
     * Head branches of the task's pull requests, open and closed.
     */
    prBranches: string[];

    /**
     * Repository to inspect. Defaults to the current directory.
     */
    baseDir?: string;
}

/**
 * Return the branch HEAD is on when a run should carry on with it instead of cutting a new one: it
 * belongs to the task, it is a task branch rather than a stack node, and no pull request has it as
 * head. That is the state a run leaves when it pushed the branch and then failed to open the PR, so
 * re-running reuses the branch instead of orphaning it and moving on to the next `--vN`.
 */
export async function findReusableTaskBranch(params: FindReusableTaskBranchParams): Promise<string | undefined> {
    const { taskBranches, prBranches, baseDir } = params;

    const current = (await simpleGit(baseDir).status()).current;
    if (
        !current ||
        !taskBranches.includes(current) ||
        stripNodeSuffix(current) !== current ||
        prBranches.includes(current)
    ) {
        return undefined;
    }

    return current;
}
