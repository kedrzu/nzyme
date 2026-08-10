import type { Logger } from '@nzyme/logging/Logger.js';

import type { GithubConfig } from '../GithubConfig.js';
import type { GithubClient } from './createGithubClient.js';
import { createGithubClient } from './createGithubClient.js';
import { findMatchingPr, resolveNodePr } from './findMatchingPr.js';
import { getCurrentBranch } from './getCurrentBranch.js';
import { handlePushPreparation } from './handlePushPreparation.js';
import { syncAllRepos } from './syncAllRepos.js';

/**
 * Parameters for pushing changes.
 */
export interface PushChangesParams {
    /**
     * GitHub configuration.
     */
    githubConfig: GithubConfig;

    /**
     * Issue/task ID.
     */
    issueId: string;

    /**
     * Logger instance.
     */
    logger: Logger;

    /**
     * Base branch name (e.g., 'main').
     */
    baseBranch: string;

    /**
     * Default commit message to use when committing changes.
     */
    defaultCommitMessage?: string;
}

/**
 * Result of pushing changes.
 */
export interface PushChangesResult {
    /**
     * GitHub client instance.
     */
    githubClient: GithubClient;

    /**
     * The matching PR, if found.
     */
    pr: Awaited<ReturnType<typeof findMatchingPr>>;
}

/**
 * Push changes: sync all repos, find matching PR, and handle push preparation.
 * Shared logic used by both push and ready commands.
 */
export async function pushChanges(params: PushChangesParams): Promise<PushChangesResult> {
    const { githubConfig, issueId, logger, baseBranch, defaultCommitMessage } = params;

    // Sync all repos: auto-commit, fetch, rebase/pull, fast-forward base
    await syncAllRepos({
        baseBranch,
        logger,
        defaultCommitMessage,
    });

    // Create GitHub client
    const githubClient = createGithubClient(githubConfig);

    // Check if PR exists and is in review. Resolved against the current branch so that on a stacked
    // task this is the node being pushed, not some other node of the same task.
    const currentBranch = await getCurrentBranch();
    const pr = await resolveNodePr(githubClient, githubConfig, issueId, currentBranch);
    const prInReview = pr ? !pr.draft : false;

    // Handle preparation (submodules and main repo)
    await handlePushPreparation({
        githubClient,
        githubConfig,
        issueId,
        logger,
        baseBranch,
        autoYes: true,
        prInReview,
        defaultCommitMessage,
    });

    return { githubClient, pr };
}
