import type { GithubConfig } from '../GithubConfig.js';
import type { GithubClient } from './createGithubClient.js';

/**
 * Shape of the GraphQL response for one page of a PR's review threads.
 */
interface ReviewThreadsResponse {
    repository: {
        pullRequest: {
            reviewThreads: {
                nodes: { isResolved: boolean }[];
                pageInfo: { hasNextPage: boolean; endCursor: string | null };
            };
        };
    };
}

const REVIEW_THREADS_QUERY = `
    query ReviewThreads($owner: String!, $repo: String!, $number: Int!, $cursor: String) {
        repository(owner: $owner, name: $repo) {
            pullRequest(number: $number) {
                reviewThreads(first: 100, after: $cursor) {
                    nodes { isResolved }
                    pageInfo { hasNextPage endCursor }
                }
            }
        }
    }
`;

/**
 * Count the unresolved review threads on a pull request via the GraphQL API.
 *
 * Used only to inform the merge confirmation summary, so it never blocks the merge: any GraphQL error
 * (e.g. insufficient token scope) degrades to `0` rather than throwing. Paginates through all threads
 * (REST does not expose review-thread resolution state).
 */
export async function countUnresolvedReviewThreads(
    client: GithubClient,
    config: GithubConfig,
    prNumber: number,
): Promise<number> {
    try {
        let unresolved = 0;
        let cursor: string | null = null;

        for (;;) {
            const response: ReviewThreadsResponse = await client.graphql(REVIEW_THREADS_QUERY, {
                owner: config.owner,
                repo: config.repo,
                number: prNumber,
                cursor,
            });

            const { nodes, pageInfo } = response.repository.pullRequest.reviewThreads;
            unresolved += nodes.filter(node => !node.isResolved).length;

            if (!pageInfo.hasNextPage) {
                return unresolved;
            }

            cursor = pageInfo.endCursor;
        }
    } catch {
        // Informational only — never block a merge on a failed review-thread lookup.
        return 0;
    }
}
