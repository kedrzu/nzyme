import type { GithubConfig } from '../GithubConfig.js';
import type { GithubClient } from './createGithubClient.js';

/**
 * GitHub PR type from Octokit.
 */
type GitHubPR = Awaited<ReturnType<GithubClient['rest']['pulls']['list']>>['data'][0];

/**
 * Find a matching open GitHub PR for an issue.
 * Searches for the issue ID in PR titles and branch names using precise matching.
 * @__NO_SIDE_EFFECTS__
 */
export async function findMatchingPr(
    client: GithubClient,
    config: GithubConfig,
    issueId: string,
): Promise<Awaited<ReturnType<typeof client.rest.pulls.list>>['data'][0] | null> {
    try {
        // Get all open PRs
        const { data: prs } = await client.rest.pulls.list({
            owner: config.owner,
            repo: config.repo,
            state: 'open',
            per_page: 100,
        });

        // Create regex pattern for precise issue ID matching
        const issueRegex = createIssueIdRegex(issueId);

        // Look for PRs that mention the issue ID in title or have it in branch name
        const matchingPr = prs.find(pr => {
            const titleMatch = issueRegex.test(pr.title);
            const branchMatch = issueRegex.test(pr.head.ref);
            return titleMatch || branchMatch;
        });

        return matchingPr || null;
    } catch (error) {
        console.error('Error searching for existing PRs:', error);
        return null;
    }
}

/**
 * Find a matching merged GitHub PR for an issue.
 * Searches for the issue ID in PR titles and branch names of closed PRs that were merged.
 * @__NO_SIDE_EFFECTS__
 */
export async function findMergedPr(
    client: GithubClient,
    config: GithubConfig,
    issueId: string,
): Promise<GitHubPR | null> {
    try {
        // Get all closed PRs
        const { data: prs } = await client.rest.pulls.list({
            owner: config.owner,
            repo: config.repo,
            state: 'closed',
            per_page: 100,
            sort: 'updated',
            direction: 'desc',
        });

        // Create regex pattern for precise issue ID matching
        const issueRegex = createIssueIdRegex(issueId);

        // Look for PRs that were merged and mention the issue ID in title or have it in branch name
        const matchingPr = prs.find(pr => {
            // Only consider merged PRs (not just closed)
            if (!pr.merged_at) {
                return false;
            }

            const titleMatch = issueRegex.test(pr.title);
            const branchMatch = issueRegex.test(pr.head.ref);
            return titleMatch || branchMatch;
        });

        return matchingPr ?? null;
    } catch (error) {
        console.error('Error searching for merged PRs:', error);
        return null;
    }
}

/**
 * Create a regex pattern that matches the issue ID only when properly bounded.
 * This prevents SIG-12 from matching SIG-123.
 * @__NO_SIDE_EFFECTS__
 */
export function createIssueIdRegex(issueId: string): RegExp {
    // Escape special regex characters in the issue ID
    const escapedIssueId = issueId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Create pattern that matches the issue ID with proper boundaries
    // (?:^|[^a-zA-Z0-9]) - starts at beginning or after non-alphanumeric character (treating _ as delimiter)
    // (?!\d) - negative lookahead: not followed by a digit (prevents SIG-12 matching SIG-123)
    // (?=[^a-zA-Z0-9]|$) - positive lookahead: followed by non-alphanumeric character or end of string
    const pattern = `(?:^|[^a-zA-Z0-9])${escapedIssueId}(?!\\d)(?=[^a-zA-Z0-9]|$)`;

    return new RegExp(pattern, 'i');
}
