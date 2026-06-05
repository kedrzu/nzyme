import { UsageError } from '@nzyme/cli';

import type { GithubConfig } from '../GithubConfig.js';
import type { GithubClient } from './createGithubClient.js';

/**
 * Squash-merge a pull request via the GitHub REST API.
 *
 * Always uses `merge_method: 'squash'` — this is the single place the squash policy is enforced. No
 * custom commit message is passed, so GitHub uses the PR title/body (its squash default). GitHub's
 * rejections (PR not mergeable, already merged, draft, failing required checks) surface as 405/409
 * responses, which are mapped to a {@link UsageError} so callers get an actionable message instead of
 * a raw API stack trace.
 */
export async function mergePullRequestSquash(
    client: GithubClient,
    config: GithubConfig,
    prNumber: number,
): Promise<void> {
    try {
        await client.rest.pulls.merge({
            owner: config.owner,
            repo: config.repo,
            pull_number: prNumber,
            merge_method: 'squash',
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        throw new UsageError(`Failed to squash-merge PR #${prNumber}: ${message}`);
    }
}
