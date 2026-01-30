import type { SimpleGit } from 'simple-git';
import { simpleGit } from 'simple-git';

import { UsageError } from '@nzyme/cli';

/**
 * Push changes to remote, handling the case where no upstream is configured.
 * @__NO_SIDE_EFFECTS__
 */
export async function pushWithUpstream(git: SimpleGit = simpleGit()): Promise<void> {
    const currentStatus = await git.status();
    const currentBranch = currentStatus.current;

    if (!currentBranch) {
        throw new UsageError('Could not determine current branch name');
    }

    // Check if tracking branch exists
    const hasUpstream = currentStatus.tracking !== null;

    if (hasUpstream) {
        await git.push();
    } else {
        await git.push('origin', currentBranch, { '--set-upstream': null });
    }
}
