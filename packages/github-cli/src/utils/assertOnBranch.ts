import type { SimpleGit } from 'simple-git';

import { UsageError } from '@nzyme/cli';

/**
 * Refuse to go on unless the working tree is still on `expectedBranch`.
 *
 * A merge or a push acts on whatever HEAD is at that instant, and a worktree is shared: another
 * command running in it — a person's, or an agent's — can check out a different branch between two
 * steps of a sync. Without this check the steps after the switch land on the other branch — a push
 * from the top node of a stack once merged its base, the middle node, into the bottom node that had
 * just been checked out, and pushed it, which GitHub read as the middle pull request being merged.
 * @param git Git instance of the repository being synced.
 * @param expectedBranch The branch the operation started on.
 */
export async function assertOnBranch(git: SimpleGit, expectedBranch: string): Promise<void> {
    const current = (await git.status()).current;

    if (current === expectedBranch) {
        return;
    }

    throw new UsageError(
        `The working tree switched from ${expectedBranch} to ${current ?? 'a detached HEAD'} while it was being ` +
            'synced — another command checked out a different branch in this worktree. Stopped before merging ' +
            `into or pushing ${current ?? 'it'}. Wait for the other command to finish, check out ${expectedBranch} ` +
            'and re-run.',
    );
}
