import { simpleGit } from 'simple-git';

/**
 * Checkout a git branch, fetching it from origin if necessary.
 */
export async function checkoutBranch(branchName: string): Promise<void> {
    const git = simpleGit();

    try {
        // First, fetch the latest changes
        await git.fetch('origin');

        // Try to checkout the branch locally first
        try {
            await git.checkout(branchName);
        } catch {
            // If local checkout fails, try to checkout from origin
            await git.checkoutBranch(branchName, `origin/${branchName}`);
        }

        // Pull the latest changes
        await git.pull('origin', branchName);
    } catch (error) {
        throw new Error(`Failed to checkout branch ${branchName}: ${(error as Error).message}`);
    }
}
