import chalk from 'chalk';

import type { GithubClient } from '@nzyme/github-cli';
import {
    applyStashedChanges,
    checkoutExistingBranch,
    createBranchAndPr,
    findMatchingPr,
    handleBranchSelection,
    syncBaseBranch,
} from '@nzyme/github-cli';
import type { BranchSelectionResult } from '@nzyme/github-cli';
import type { GithubConfig } from '@nzyme/github-cli';
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
     * GitHub client instance.
     */
    githubClient: GithubClient;

    /**
     * GitHub configuration.
     */
    githubConfig: GithubConfig;

    /**
     * Logger instance.
     */
    logger: Logger;

    /**
     * Base branches to use when creating new branches.
     */
    baseBranches: string[];

    /**
     * Branch prefix to use when creating new branches.
     * @default 'bug'
     */
    branchPrefix?: string;
}

/**
 * Switch to a Sentry issue by checking out existing branch or creating new branch with PR.
 * This contains the common logic used by both "issue start" and similar commands.
 */
export async function switchToSentryIssue(params: SwitchToSentryIssueParams): Promise<void> {
    const {
        issueId,
        organizationSlug,
        sentryClient,
        githubClient,
        githubConfig,
        logger,
        baseBranches,
        branchPrefix = 'bug',
    } = params;

    logger.info(`🔍 Looking for Sentry issue: ${chalk.bold(issueId)}`);

    // Get Sentry issue details
    const issueData = await getSentryIssue(sentryClient, organizationSlug, issueId);

    if (!issueData) {
        throw new Error(`Sentry issue ${issueId} not found`);
    }

    logger.info(`📝 Found issue: ${chalk.green(issueData.title)}`);

    // Search for existing PR
    logger.info(`🔍 Searching for existing GitHub PR...`);
    const existingPr = await findMatchingPr(githubClient, githubConfig, issueData.shortId);

    if (existingPr) {
        // Checkout existing PR branch
        logger.info(`✅ Found existing PR: ${chalk.blue(existingPr.title)} (#${existingPr.number})`);
        logger.info(`🔄 Checking out branch: ${chalk.cyan(existingPr.head.ref)}`);

        await checkoutExistingBranch(existingPr.head.ref, issueData.shortId, logger);

        // Sync with PR's base branch after checkout
        const prBaseBranch = existingPr.base.ref;
        logger.info(`🔄 Synchronizing with PR base branch ${chalk.cyan(prBaseBranch)}`);
        await syncBaseBranch(prBaseBranch, logger);

        logger.info(`🎉 Successfully checked out existing branch for ${chalk.bold(issueData.shortId)}`);
    } else {
        // Create new branch and PR
        logger.info(`📝 No existing PR found. Creating new branch and draft PR...`);

        if (baseBranches.length === 0) {
            throw new Error('No base branches configured');
        }

        // Handle branch selection and stashing if needed
        const branchResult: BranchSelectionResult = await handleBranchSelection({
            baseBranches,
            taskId: issueData.shortId,
            logger,
        });

        const title = issueData.title
            .toLowerCase()
            .replace(/[^a-zA-Z0-9]/g, '-')
            .replace(/-+/g, '-')
            .slice(0, 50);

        const branchName = `${branchPrefix}/${issueData.shortId}--${title}`;

        // Build PR title with project context
        const prTitle = `[${issueData.shortId}][${issueData.project.name}] ${issueData.title}`;

        logger.info(`🌿 Creating branch: ${chalk.cyan(branchName)}`);

        const selectedBaseBranch = branchResult.selectedBaseBranch;

        const result = await createBranchAndPr({
            client: githubClient,
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
