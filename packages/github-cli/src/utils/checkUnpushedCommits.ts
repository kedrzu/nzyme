import type { SimpleGit } from 'simple-git';
import { simpleGit } from 'simple-git';

import { UsageError } from '@nzyme/cli';

/**
 * Result of checking for unpushed commits.
 */
export interface UnpushedCommitsResult {
    /**
     * Whether there are unpushed commits.
     */
    hasUnpushedCommits: boolean;

    /**
     * Number of unpushed commits.
     */
    commitsCount: number;

    /**
     * Commit messages of unpushed commits.
     */
    commitMessages: string[];
}

/**
 * Check if there are unpushed commits in the current branch.
 */
export async function checkUnpushedCommits(git: SimpleGit = simpleGit()): Promise<UnpushedCommitsResult> {
    try {
        // Get current branch
        const status = await git.status();
        const currentBranch = status.current;

        if (!currentBranch) {
            throw new UsageError('Could not determine current branch');
        }

        // Check if remote tracking branch exists
        const remoteRef = `origin/${currentBranch}`;

        try {
            // Check if the remote branch exists
            await git.raw(['show-ref', '--verify', '--quiet', `refs/remotes/${remoteRef}`]);
        } catch {
            // Remote branch doesn't exist, so all commits are unpushed
            const log = await git.log(['--oneline']);
            return {
                hasUnpushedCommits: log.all.length > 0,
                commitsCount: log.all.length,
                commitMessages: log.all.map(commit => commit.message),
            };
        }

        // Get commits that are in current branch but not in remote branch
        try {
            const result = await git.raw(['rev-list', '--count', `${remoteRef}..${currentBranch}`]);
            const commitsCount = parseInt(result.trim(), 10);

            if (commitsCount === 0) {
                return {
                    hasUnpushedCommits: false,
                    commitsCount: 0,
                    commitMessages: [],
                };
            }

            // Get the actual commit messages
            const log = await git.log({
                from: remoteRef,
                to: currentBranch,
            });

            return {
                hasUnpushedCommits: true,
                commitsCount,
                commitMessages: log.all.map(commit => commit.message),
            };
        } catch {
            // Remote branch reference exists but is invalid/ambiguous
            // Treat it as if remote branch doesn't exist - all commits are unpushed
            const log = await git.log(['--oneline']);
            return {
                hasUnpushedCommits: log.all.length > 0,
                commitsCount: log.all.length,
                commitMessages: log.all.map(commit => commit.message),
            };
        }
    } catch (error) {
        throw new UsageError(`Failed to check unpushed commits: ${(error as Error).message}`);
    }
}
