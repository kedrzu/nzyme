import type { simpleGit } from 'simple-git';

/**
 * Guarantee a local branch by that name exists, creating it from `origin/<branch>` when it does not.
 *
 * A stack node's branch is created remotely by `stackTask` and only gains a local counterpart once
 * someone checks that node out — so every node above the one a worktree actually checked out is
 * missing locally, which is the normal state rather than an error. Anything that counts commits
 * against those branches has to resolve them first, or git fails on an absent ref.
 *
 * Only a branch missing on `origin` too — a typo, or one deleted upstream — is left to throw.
 */
export async function ensureLocalBranch(git: ReturnType<typeof simpleGit>, branch: string): Promise<void> {
    const localBranches = await git.branchLocal();
    if (localBranches.all.includes(branch)) {
        return;
    }

    await git.fetch('origin', branch);
    await git.raw(['branch', branch, `origin/${branch}`]);
}
