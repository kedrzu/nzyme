import { simpleGit } from 'simple-git';

import { getBaseBranchName } from './branchVersionHelpers.js';

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
