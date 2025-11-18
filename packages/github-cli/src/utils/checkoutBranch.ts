import { simpleGit } from 'simple-git';

import { UsageError } from '@nzyme/cli';

/**
 * Checkout a git branch, fetching it from origin if necessary.
 */
export async function checkoutBranch(branchName: string): Promise<void> {
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
        try {
            await git.pull('origin', branchName);
        } catch {
            // If pull fails, the branch might not exist on origin yet, which is fine
            // This can happen with newly created local branches
        }
    } catch (error) {
        throw new UsageError(`Failed to checkout branch ${branchName}: ${(error as Error).message}`);
    }
}
