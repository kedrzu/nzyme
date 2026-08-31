import { UsageError } from '@nzyme/cli';

import type { GithubConfig } from '../GithubConfig.js';
import { extractBranchVersion, extractNodeIndex, getBaseBranchName } from './branchVersionHelpers.js';
import type { GithubClient } from './createGithubClient.js';

/**
 * GitHub PR type from Octokit.
 *
 * Exported so callers can name what these functions return instead of re-deriving it from their
 * signatures — a `ReturnType<typeof ...>` chain breaks the moment one of them is renamed.
 */
export type GitHubPR = Awaited<ReturnType<GithubClient['rest']['pulls']['list']>>['data'][0];

/**
 * Find a matching open GitHub PR for an issue.
 * Searches for the issue ID in PR titles and branch names using precise matching.
 * Supports versioned branches and returns the best match.
 * @__NO_SIDE_EFFECTS__
 */
export function findMatchingPr(
    client: GithubClient,
    config: GithubConfig,
    issueId: string,
): Promise<Awaited<ReturnType<typeof client.rest.pulls.list>>['data'][0] | null> {
    return findBestMatchingPr(client, config, issueId);
}

/**
 * Find every open pull request belonging to an issue, ordered bottom to top by stack position.
 *
 * A task normally has exactly one open PR; it has several only once it has been split into a stack,
 * where each node's branch carries the same issue ID plus a `--sN` suffix.
 * @__NO_SIDE_EFFECTS__
 */
export async function findTaskPrs(client: GithubClient, config: GithubConfig, issueId: string): Promise<GitHubPR[]> {
    const allMatchingPrs = await findAllMatchingPrs(client, config, issueId);
    const openPrs = allMatchingPrs.filter(pr => pr.state === 'open' && !pr.merged_at);

    return openPrs.toSorted((a, b) => extractNodeIndex(a.head.ref) - extractNodeIndex(b.head.ref));
}

/**
 * Find the open pull request whose head is exactly this branch.
 *
 * Use this when the question is "does the branch I am on already have a PR" rather than "which PR
 * belongs to this task" — with a stack the task owns several, so the issue ID alone cannot answer it.
 * @__NO_SIDE_EFFECTS__
 */
export async function findPrForBranch(
    client: GithubClient,
    config: GithubConfig,
    issueId: string,
    branchName: string,
): Promise<GitHubPR | null> {
    const openPrs = await findTaskPrs(client, config, issueId);
    return openPrs.find(pr => pr.head.ref === branchName) ?? null;
}

/**
 * Resolve the one pull request a command should act on.
 *
 * With a single open PR this returns it whatever branch you are standing on — the long-standing
 * behavior, and the reason an unstacked task is completely unaffected by stacks existing. Only when
 * a task has several open PRs does the current branch decide, because "the PR for SIG-123" stops
 * being a well-defined thing: picking the most recently updated one, as the old lookup did, would
 * silently push to or merge the wrong node.
 */
export async function resolveNodePr(
    client: GithubClient,
    config: GithubConfig,
    issueId: string,
    currentBranch: string,
): Promise<GitHubPR | null> {
    const openPrs = await findTaskPrs(client, config, issueId);

    if (openPrs.length <= 1) {
        return openPrs[0] ?? null;
    }

    const currentPr = openPrs.find(pr => pr.head.ref === currentBranch);
    if (currentPr) {
        return currentPr;
    }

    const nodes = openPrs.map(pr => `  #${pr.number} ${pr.head.ref}`).join('\n');
    throw new UsageError(
        `Task ${issueId} has ${openPrs.length} open pull requests, but branch "${currentBranch}" is none of them:\n` +
            `${nodes}\n` +
            'Check out the node you want to act on first.',
    );
}

/**
 * Find a matching merged GitHub PR for an issue.
 * Searches for the issue ID in PR titles and branch names of closed PRs that were merged.
 * Supports versioned branches and returns the most recently merged PR.
 * @__NO_SIDE_EFFECTS__
 */
export async function findMergedPr(
    client: GithubClient,
    config: GithubConfig,
    issueId: string,
): Promise<GitHubPR | null> {
    const allMatchingPrs = await findAllMatchingPrs(client, config, issueId);

    // Filter for merged PRs only
    const mergedPrs = allMatchingPrs.filter(pr => pr.merged_at);

    if (mergedPrs.length === 0) {
        return null;
    }

    // Return the most recently merged PR
    const sorted = mergedPrs.toSorted((a, b) => {
        const dateA = a.merged_at ? new Date(a.merged_at) : new Date(0);
        const dateB = b.merged_at ? new Date(b.merged_at) : new Date(0);
        return dateB.getTime() - dateA.getTime();
    });

    return sorted[0]!;
}

/**
 * Find all matching PRs (open and closed) for an issue.
 * Supports versioned branches (e.g., branch-name--v2, branch-name--v3).
 * @__NO_SIDE_EFFECTS__
 */
export async function findAllMatchingPrs(
    client: GithubClient,
    config: GithubConfig,
    issueId: string,
): Promise<GitHubPR[]> {
    try {
        // Get both open and closed PRs
        const [openPrs, closedPrs] = await Promise.all([
            client.rest.pulls.list({
                owner: config.owner,
                repo: config.repo,
                state: 'open',
                per_page: 100,
            }),
            client.rest.pulls.list({
                owner: config.owner,
                repo: config.repo,
                state: 'closed',
                per_page: 100,
                sort: 'updated',
                direction: 'desc',
            }),
        ]);

        const allPrs = [...openPrs.data, ...closedPrs.data];

        // Create regex pattern for precise issue ID matching
        const issueRegex = createIssueIdRegex(issueId);

        // Find all PRs that match the issue ID
        const matchingPrs = allPrs.filter(pr => {
            const titleMatch = issueRegex.test(pr.title);
            const branchMatch = issueRegex.test(pr.head.ref);
            return titleMatch || branchMatch;
        });

        return matchingPrs;
    } catch (error) {
        console.error('Error searching for PRs:', error);
        return [];
    }
}

/**
 * Find the best matching open PR for an issue.
 * When multiple versioned branches exist, returns the one with highest version or most recently updated.
 * @__NO_SIDE_EFFECTS__
 */
export async function findBestMatchingPr(
    client: GithubClient,
    config: GithubConfig,
    issueId: string,
): Promise<GitHubPR | null> {
    const allMatchingPrs = await findAllMatchingPrs(client, config, issueId);

    // Filter for open PRs only
    const openPrs = allMatchingPrs.filter(pr => pr.state === 'open' && !pr.merged_at);

    if (openPrs.length === 0) {
        return null;
    }

    if (openPrs.length === 1) {
        return openPrs[0]!;
    }

    // Multiple open PRs - group by base branch name and pick the highest version
    const prsByBaseBranch = new Map<string, GitHubPR[]>();

    for (const pr of openPrs) {
        const baseBranch = getBaseBranchName(pr.head.ref);
        const existing = prsByBaseBranch.get(baseBranch) ?? [];
        existing.push(pr);
        prsByBaseBranch.set(baseBranch, existing);
    }

    // For each base branch, pick the PR with highest version
    const bestPrs: GitHubPR[] = [];
    for (const prs of prsByBaseBranch.values()) {
        const sorted = prs.toSorted((a, b) => {
            const versionA = extractBranchVersion(a.head.ref);
            const versionB = extractBranchVersion(b.head.ref);
            return versionB - versionA; // Descending order
        });
        bestPrs.push(sorted[0]!);
    }

    // If there's only one best PR, return it
    if (bestPrs.length === 1) {
        return bestPrs[0]!;
    }

    // Multiple best PRs from different base branches - return most recently updated
    const sorted = bestPrs.toSorted((a, b) => {
        const dateA = new Date(a.updated_at);
        const dateB = new Date(b.updated_at);
        return dateB.getTime() - dateA.getTime();
    });

    return sorted[0]!;
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
