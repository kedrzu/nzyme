import { simpleGit } from 'simple-git';

import { UsageError } from '@nzyme/cli';
import type { Logger } from '@nzyme/logging/Logger.js';

import { handlePullWithRebase } from './handlePullWithRebase.js';

/**
 * Checkout a git branch, fetching it from origin if necessary.
 * @param branchName Branch to check out.
 * @param logger Logger instance.
 * @param unattended Whether nobody is available to answer a question. When set, a branch that has
 * diverged from origin fails instead of prompting for a rebase.
 */
export async function checkoutBranch(branchName: string, logger: Logger, unattended?: boolean): Promise<void> {
    const git = simpleGit();

    try {
        // First, fetch the latest changes
        await git.fetch('origin');

        // Check if the branch exists locally
        const localBranches = await git.branchLocal();
        const branchExists = localBranches.all.includes(branchName);

        if (branchExists) {
            // Branch exists locally, just checkout
            await git.checkout(branchName);
        } else {
            // Branch doesn't exist locally, check if it exists on origin
            try {
                // Try to checkout from origin
                await git.checkoutBranch(branchName, `origin/${branchName}`);
            } catch {
                // If checkout from origin fails, try a simple checkout (branch might not exist on origin)
                await git.checkout(branchName);
            }
        }

        // Pull the latest changes (only if the branch exists on origin)
        const pullResult = await handlePullWithRebase({
            git,
            remote: 'origin',
            branch: branchName,
            logger,
            contextMessage: 'repository',
            unattended,
        });

        if (pullResult.cancelled) {
            // Routine rather than exceptional - CI pushes to task branches, so this is reached often
            // enough that the message has to say what happened and what resolves it.
            throw new UsageError(
                `${branchName} has diverged from origin/${branchName} and was not rebased. ` +
                    `Reconcile it (git pull --rebase) and run the command again.`,
            );
        }
        // If pull failed for other reasons (e.g., branch doesn't exist), continue
        // This is fine for newly created local branches
    } catch (error) {
        throw new UsageError(`Failed to checkout branch ${branchName}: ${(error as Error).message}`);
    }
}
