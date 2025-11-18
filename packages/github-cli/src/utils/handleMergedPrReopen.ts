import chalk from 'chalk';
import enquirer from 'enquirer';

import { UsageError } from '@nzyme/cli';
import type { Logger } from '@nzyme/logging';

import type { GithubConfig } from '../GithubConfig.js';
import { determineNextVersion, extractBranchVersion } from './branchVersionHelpers.js';
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
 * Check if a task PR was merged or canceled and handle the reopen flow.
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

    // Check if any PR for this task was merged or closed
    const allMatchingPrs = await findAllMatchingPrs(githubClient, githubConfig, issueId);
    const mergedPrs = allMatchingPrs.filter(pr => pr.merged_at);
    const closedPrs = allMatchingPrs.filter(pr => pr.state === 'closed' && !pr.merged_at);

    if (mergedPrs.length === 0 && closedPrs.length === 0) {
        // No merged or closed PRs, proceed normally
        return { reopened: false };
    }

    // Found merged or closed PR(s) - determine the next branch name
    const allClosedPrs = [...mergedPrs, ...closedPrs];
    const mostRecentClosedPr = allClosedPrs.sort((a, b) => {
        const dateA = a.merged_at || a.closed_at || '1970-01-01';
        const dateB = b.merged_at || b.closed_at || '1970-01-01';
        return new Date(dateB).getTime() - new Date(dateA).getTime();
    })[0]!;

    // Determine the status message
    const isMerged = !!mostRecentClosedPr.merged_at;
    const statusMessage = isMerged ? 'Merged' : 'Closed';
    const statusDate = mostRecentClosedPr.merged_at || mostRecentClosedPr.closed_at;

    logger.info('');
    logger.info(chalk.bold.yellow(`⚠️  Task PR Already ${statusMessage}`));
    logger.info('═'.repeat(50));
    logger.info(`📝 Task: ${chalk.bold(issueId)} - ${issueTitle}`);
    logger.info(`${isMerged ? '✅' : '❌'} PR #${mostRecentClosedPr.number} was ${statusMessage.toLowerCase()} at ${statusDate}`);
    logger.info(`🌿 Branch: ${chalk.cyan(mostRecentClosedPr.head.ref)}`);
    
    // Show summary of all closed PRs if there are multiple
    if (allClosedPrs.length > 1) {
        logger.info('');
        logger.info(`📊 Found ${allClosedPrs.length} closed PR(s) for this task:`);
        for (const pr of allClosedPrs) {
            const prStatus = pr.merged_at ? chalk.green('merged') : chalk.red('closed');
            logger.info(`   • PR #${pr.number} (${chalk.cyan(pr.head.ref)}): ${prStatus}`);
        }
    }
    logger.info('');

    // Ask user if they want to reopen
    const { action } = await enquirer.prompt<{ action: string }>({
        type: 'select',
        name: 'action',
        message: `Task ${chalk.bold(issueId)} PR has been ${statusMessage.toLowerCase()}. What would you like to do?`,
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
    // Use all closed PR branches to determine the next version
    const allClosedBranches = allClosedPrs.map(pr => pr.head.ref);
    const latestBranchName = mostRecentClosedPr.head.ref;
    const newBranchName = determineNextVersion(latestBranchName, allClosedBranches);

    logger.info(`🌿 Creating new versioned branch: ${chalk.cyan(newBranchName)}`);

    // Extract version for PR title
    const versionNumber = extractBranchVersion(newBranchName);
    const versionSuffix = versionNumber > 1 ? ` (v${versionNumber})` : '';
    
    // Create PR title with version number
    const prTitle = projectName 
        ? `[${issueId}][${projectName}] ${issueTitle}${versionSuffix}` 
        : `[${issueId}] ${issueTitle}${versionSuffix}`;

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
