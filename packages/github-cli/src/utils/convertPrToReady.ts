import { UsageError } from '@nzyme/cli';

import type { GithubConfig } from '../GithubConfig.js';
import type { GithubClient } from './createGithubClient.js';

/**
 * Convert a GitHub PR from draft to ready for review.
 */
export async function convertPrToReady(client: GithubClient, config: GithubConfig, prNumber: number): Promise<void> {
    try {
        // Get current PR details to check if it's already ready
        const { data: pr } = await client.rest.pulls.get({
            owner: config.owner,
            repo: config.repo,
            pull_number: prNumber,
        });

        if (!pr.draft) {
            throw new UsageError(`PR #${prNumber} is already ready for review`);
        }

        // Use GraphQL API to mark PR as ready for review - this is more reliable than REST API
        const mutation = `
            mutation MarkPullRequestReadyForReview($pullRequestId: ID!) {
                markPullRequestReadyForReview(input: { pullRequestId: $pullRequestId }) {
                    pullRequest {
                        id
                        number
                        isDraft
                    }
                }
            }
        `;

        const response = await client.graphql(mutation, {
            pullRequestId: pr.node_id,
        });

        // Verify the mutation succeeded
        const result = response as {
            markPullRequestReadyForReview: {
                pullRequest: {
                    id: string;
                    isDraft: boolean;
                    number: number;
                };
            };
        };

        if (result.markPullRequestReadyForReview.pullRequest.isDraft) {
            throw new UsageError(`Failed to mark PR #${prNumber} as ready for review - it's still in draft state`);
        }
    } catch (error) {
        if (error instanceof UsageError) {
            throw error;
        }
        throw new UsageError(`Failed to convert PR #${prNumber} to ready: ${(error as Error).message}`);
    }
}
