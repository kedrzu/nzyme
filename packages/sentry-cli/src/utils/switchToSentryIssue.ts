import type { Octokit } from '@octokit/rest';
import chalk from 'chalk';

import {
    applyStashedChanges,
    checkoutExistingBranch,
    createBranchAndPr,
    findMatchingPr,
    getCurrentBranch,
    handleBranchSelection,
    syncBaseBranch,
} from '@nzyme/github-cli';
import type { GitHubConfig } from '@nzyme/github-cli';
import type { Logger } from '@nzyme/logging';

import type { SentryApiClient } from './createSentryClient.js';
import { getSentryIssue } from './getSentryIssue.js';

/**
 * Parameters for switching to a Sentry issue.
 */
export interface SwitchToSentryIssueParams {
    /**
     * The Sentry issue ID.
     */
    issueId: string;

    /**
     * Sentry organization slug.
     */
    organizationSlug: string;

    /**
     * Sentry API client instance.
     */
    sentryClient: SentryApiClient;

    /**
     * GitHub Octokit client instance.
     */
    octokit: Octokit;

    /**
     * GitHub configuration.
     */
    githubConfig: GitHubConfig;

    /**
     * Logger instance.
     */
    logger: Logger;

    /**
     * Base branch to use when creating new branches.
     */
    baseBranch?: string;
}

/**
 * Switch to a Sentry issue by checking out existing branch or creating new branch with PR.
 * This contains the common logic used by both "issue start" and similar commands.
 */
export async function switchToSentryIssue(params: SwitchToSentryIssueParams): Promise<void> {
    const { issueId, organizationSlug, sentryClient, octokit, githubConfig, logger, baseBranch } = params;

    logger.info(`🔍 Looking for Sentry issue: ${chalk.bold(issueId)}`);

    // Get Sentry issue details
    const issueData = await getSentryIssue(sentryClient, organizationSlug, issueId);

    if (!issueData) {
        throw new Error(`Sentry issue ${issueId} not found`);
    }

    logger.info(`📝 Found issue: ${chalk.green(issueData.title)}`);

    // Search for existing PR
    logger.info(`🔍 Searching for existing GitHub PR...`);
    const existingPr = await findMatchingPr(octokit, githubConfig, issueData.shortId);

    if (existingPr) {
        // Checkout existing PR branch
        logger.info(`✅ Found existing PR: ${chalk.blue(existingPr.title)} (#${existingPr.number})`);
        logger.info(`🔄 Checking out branch: ${chalk.cyan(existingPr.head.ref)}`);

        await checkoutExistingBranch(existingPr.head.ref, issueData.shortId, logger);

        // Sync with base branch after checkout
        if (baseBranch) {
            logger.info(`🔄 Synchronizing with base branch ${chalk.cyan(baseBranch)}`);
            await syncBaseBranch(baseBranch, logger);
        }

        logger.info(`🎉 Successfully checked out existing branch for ${chalk.bold(issueData.shortId)}`);
    } else {
        // Create new branch and PR
        logger.info(`📝 No existing PR found. Creating new branch and draft PR...`);

        // Get current branch
        const currentBranch = await getCurrentBranch();

        if (!baseBranch) {
            throw new Error('Base branch is not configured');
        }

        // Handle branch selection and stashing if needed
        const branchResult = await handleBranchSelection(currentBranch, baseBranch, issueData.shortId, logger);

        const branchName = `${issueData.shortId.toLowerCase()}-${issueData.title
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .slice(0, 50)}`;

        // Build PR title with project context
        const prTitle = `[${issueData.shortId}][${issueData.project.name}] ${issueData.title}`;

        logger.info(`🌿 Creating branch: ${chalk.cyan(branchName)}`);

        const selectedBaseBranch = branchResult.useBaseBranch ? baseBranch : currentBranch;

        const result = await createBranchAndPr({
            octokit,
            config: githubConfig,
            branchName,
            prTitle,
            description: `Sentry Issue: ${issueData.title}\n\nType: ${issueData.type}\nLevel: ${issueData.level}\nCount: ${issueData.count}`,
            issueId: issueData.shortId,
            taskUrl: issueData.permalink,
            issueTitle: issueData.title,
            baseBranch: selectedBaseBranch,
        });

        // Apply stashed changes if any
        if (branchResult.stashName) {
            await applyStashedChanges(branchResult.stashName, logger);
        }

        logger.info(`✅ Created draft PR: ${chalk.blue(result.pr.title)} (#${result.pr.number})`);
        logger.info(`🔗 PR URL: ${chalk.blueBright(chalk.underline(result.pr.html_url))}`);
        logger.info(`🎉 Successfully created and checked out new branch for ${chalk.bold(issueData.shortId)}`);
    }

    // Show issue URL for reference
    logger.info(`🔗 Sentry issue: ${chalk.underline(issueData.permalink)}`);
}
