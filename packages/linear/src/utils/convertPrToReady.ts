import type { Octokit } from '@octokit/rest';

import { UsageError } from '@nzyme/cli';

import type { GitHubConfig } from '../cli/defineLinearCommands.js';

/**
 * Convert a GitHub PR from draft to ready for review.
 */
export async function convertPrToReady(octokit: Octokit, config: GitHubConfig, prNumber: number): Promise<void> {
    try {
        // Get current PR details
        const { data: pr } = await octokit.rest.pulls.get({
            owner: config.owner,
            repo: config.repo,
            pull_number: prNumber,
        });

        if (!pr.draft) {
            throw new UsageError(`PR #${prNumber} is already ready for review`);
        }

        // Convert from draft to ready
        await octokit.rest.pulls.update({
            owner: config.owner,
            repo: config.repo,
            pull_number: prNumber,
            draft: false,
        });
    } catch (error) {
        if (error instanceof UsageError) {
            throw error;
        }
        throw new Error(`Failed to convert PR #${prNumber} to ready: ${(error as Error).message}`);
    }
}
