import type { SimpleGit } from 'simple-git';

import { assertOnBranch } from './assertOnBranch.js';
import type { UpperNodeHead } from './assertPushLeavesUpperNodesOpen.js';
import { assertPushLeavesUpperNodesOpen } from './assertPushLeavesUpperNodesOpen.js';

/**
 * Checks run right before an operation writes to a branch's history: {@link BranchGuard.beforeWrite}
 * ahead of a rebase, merge or commit, {@link BranchGuard.beforePush} ahead of a push. Either throws to
 * stop the write.
 */
export interface BranchGuard {
    beforeWrite: () => Promise<void>;
    beforePush: () => Promise<void>;
}

/**
 * Parameters for {@link createBranchGuard}.
 */
export interface CreateBranchGuardParams {
    /**
     * Git instance of the repository being written to.
     */
    git: SimpleGit;

    /**
     * The branch the operation is for — pinned when it started.
     */
    branch: string;

    /**
     * The nodes stacked directly on {@link branch}, looked up at push time so the heads are current.
     */
    findUpperNodes: () => Promise<UpperNodeHead[]>;
}

/**
 * Guard every write an operation makes to `branch`: each must still find `branch` checked out (see
 * `assertOnBranch`), and a push may not carry the head of a node stacked on it (see
 * `assertPushLeavesUpperNodesOpen`).
 */
export function createBranchGuard(params: CreateBranchGuardParams): BranchGuard {
    const { git, branch, findUpperNodes } = params;

    return {
        beforeWrite: () => assertOnBranch(git, branch),
        beforePush: async () => {
            await assertOnBranch(git, branch);
            await assertPushLeavesUpperNodesOpen({ git, branch, upperNodes: await findUpperNodes() });
        },
    };
}
