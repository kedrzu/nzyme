import chalk from 'chalk';
import enquirer from 'enquirer';

import { UsageError } from '@nzyme/cli';
import type { Logger } from '@nzyme/logging';

import type { GithubConfig } from '../GithubConfig.js';
import { incrementBranchVersion } from './branchVersionHelpers.js';
import { createBranchAndPr } from './createBranchAndPr.js';
import type { GithubClient } from './createGithubClient.js';
import { findAllMatchingPrs } from './findMatchingPr.js';

/**
 * Parameters for handling merged PR reopen.
 */
export interface HandleMergedPrReopenParams {
    /**
     * GitHub client instance.
     */
    githubClient: GithubClient;

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
     * Issue title for PR creation.
     */
    issueTitle: string;

    /**
     * Issue description for PR creation.
     */
    issueDescription: string;

    /**
     * Issue URL for PR body.
     */
    issueUrl: string;

    /**
     * Base branch for PR creation.
     */
    baseBranch: string;

    /**
     * Optional project name for PR title.
     */
    projectName?: string;

    /**
     * Optional callback to reopen the task in the external system (e.g., Linear).
     */
    onReopenTask?: () => Promise<void>;
}

/**
 * Result of handling merged PR reopen.
 */
export interface HandleMergedPrReopenResult {
    /**
     * Whether the task was reopened and a new branch was created.
     */
    reopened: boolean;

    /**
     * The new branch name if reopened, undefined otherwise.
     */
    newBranchName?: string;
}

/**
 * Check if a task PR was merged and handle the reopen flow.
 * Prompts the user to reopen the task and creates a new versioned branch if they confirm.
 * Returns information about whether the task was reopened.
 */
export async function handleMergedPrReopen(params: HandleMergedPrReopenParams): Promise<HandleMergedPrReopenResult> {
    const {
        githubClient,
        githubConfig,
        issueId,
        logger,
        issueTitle,
        issueDescription,
        issueUrl,
        baseBranch,
        projectName,
        onReopenTask,
    } = params;

    // Check if any PR for this task was merged
    const allMatchingPrs = await findAllMatchingPrs(githubClient, githubConfig, issueId);
    const mergedPrs = allMatchingPrs.filter(pr => pr.merged_at);

    if (mergedPrs.length === 0) {
        // No merged PRs, proceed normally
        return { reopened: false };
    }

    // Found merged PR(s) - determine the next branch name
    const mostRecentMergedPr = mergedPrs.sort((a, b) => {
        const dateA = a.merged_at ? new Date(a.merged_at) : new Date(0);
        const dateB = b.merged_at ? new Date(b.merged_at) : new Date(0);
        return dateB.getTime() - dateA.getTime();
    })[0]!;

    logger.info('');
    logger.info(chalk.bold.yellow('⚠️  Task PR Already Merged'));
    logger.info('═'.repeat(50));
    logger.info(`📝 Task: ${chalk.bold(issueId)} - ${issueTitle}`);
    logger.info(`✅ PR #${mostRecentMergedPr.number} was merged at ${mostRecentMergedPr.merged_at}`);
    logger.info(`🌿 Branch: ${chalk.cyan(mostRecentMergedPr.head.ref)}`);
    logger.info('');

    // Ask user if they want to reopen
    const { action } = await enquirer.prompt<{ action: string }>({
        type: 'select',
        name: 'action',
        message: `Task ${chalk.bold(issueId)} PR has been merged. What would you like to do?`,
        choices: [
            {
                name: 'reopen',
                message: `${chalk.green('Reopen task and create new versioned branch')}`,
            },
            {
                name: 'cancel',
                message: `${chalk.red('Cancel')}`,
            },
        ],
    });

    if (action === 'cancel') {
        throw new UsageError('Task switching cancelled by user');
    }

    // Reopen the task
    logger.info('🔄 Reopening task...');

    // Call the callback to reopen in external system if provided
    if (onReopenTask) {
        await onReopenTask();
    }

    // Determine the new branch name with incremented version
    const latestBranchName = mostRecentMergedPr.head.ref;
    const newBranchName = incrementBranchVersion(latestBranchName);

    logger.info(`🌿 Creating new versioned branch: ${chalk.cyan(newBranchName)}`);

    // Create PR title
    const prTitle = projectName ? `[${issueId}][${projectName}] ${issueTitle}` : `[${issueId}] ${issueTitle}`;

    // Create new branch and PR
    const result = await createBranchAndPr({
        client: githubClient,
        config: githubConfig,
        branchName: newBranchName,
        prTitle,
        description: issueDescription,
        issueId,
        taskUrl: issueUrl,
        issueTitle,
        baseBranch,
    });

    logger.info(`✅ Created draft PR: ${chalk.blue(result.pr.title)} (#${result.pr.number})`);
    logger.info(`🔗 PR URL: ${chalk.blueBright(chalk.underline(result.pr.html_url))}`);
    logger.info(`🎉 Successfully reopened task with new version: ${chalk.cyan(newBranchName)}`);

    return {
        reopened: true,
        newBranchName,
    };
}
