import { simpleGit } from 'simple-git';

import { UsageError } from '@nzyme/cli';

/**
 * Get the current git branch name.
 */
export async function getCurrentBranch(): Promise<string> {
    const git = simpleGit();

    try {
        const status = await git.status();
        const currentBranch = status.current;

        if (!currentBranch) {
            throw new UsageError('Could not determine current branch. Make sure you are in a git repository.');
        }

        return currentBranch;
    } catch (error) {
        throw new UsageError(`Failed to get current branch: ${(error as Error).message}`);
    }
}
