import type { LinearClient } from '@linear/sdk';
import chalk from 'chalk';

import { UsageError } from '@nzyme/cli';
import type { GithubConfig } from '@nzyme/github-cli/GithubConfig.js';
import { checkoutExistingBranch } from '@nzyme/github-cli/utils/checkoutExistingBranch.js';
import { createBranchAndPr } from '@nzyme/github-cli/utils/createBranchAndPr.js';
import type { GithubClient } from '@nzyme/github-cli/utils/createGithubClient.js';
import { findMatchingPr } from '@nzyme/github-cli/utils/findMatchingPr.js';
import { applyStashedChanges, handleBranchSelection } from '@nzyme/github-cli/utils/handleBranchSelection.js';
import type { BranchSelectionResult } from '@nzyme/github-cli/utils/handleBranchSelection.js';
import { handleMergedPrReopen } from '@nzyme/github-cli/utils/handleMergedPrReopen.js';
import { syncBaseBranch } from '@nzyme/github-cli/utils/syncBaseBranch.js';
import type { Logger } from '@nzyme/logging/Logger.js';

import { handleTaskAssignment } from './handleTaskAssignment.js';
import { handleTerminalState } from './handleTerminalState.js';
import { reopenLinearTask } from './reopenLinearTask.js';
import { startTaskIfNotStarted } from './startTaskIfNotStarted.js';

/**
 * Parameters for switching to a task.
 */
export interface SwitchToTaskParams {
    /**
     * The Linear issue ID (e.g., "SIG-123").
     */
    issueId: string;

    /**
     * Linear client instance.
     */
    linearClient: LinearClient;

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
}

/**
 * Switch to a task by checking out existing branch or creating new branch with PR.
 * This contains the common logic used by both "task start" and "task new" commands.
 */
export async function switchToTask(params: SwitchToTaskParams): Promise<void> {
    const { issueId, linearClient, githubClient, githubConfig, logger, baseBranches } = params;

    logger.info(`🔍 Looking for Linear task: ${chalk.bold(issueId)}`);

    // Get Linear issue details
    const issueData = await linearClient.issue(issueId);

    if (!issueData) {
        throw new UsageError(`Linear task ${issueId} not found`);
    }

    logger.info(`📝 Found task: ${chalk.green(issueData.title)}`);

    // Check if task is in terminal state and handle accordingly
    await handleTerminalState(issueData, logger);

    // Handle task assignment and search for existing PR in parallel
    logger.info(`🔍 Searching for existing GitHub PR...`);
    const [, existingPr] = await Promise.all([
        handleTaskAssignment(linearClient, issueData, logger),
        findMatchingPr(githubClient, githubConfig, issueId),
    ]);

    if (existingPr) {
        // Checkout existing PR branch
        logger.info(`✅ Found existing PR: ${chalk.blue(existingPr.title)} (#${existingPr.number})`);
        logger.info(`🔄 Checking out branch: ${chalk.cyan(existingPr.head.ref)}`);

        await checkoutExistingBranch({
            branchName: existingPr.head.ref,
            taskId: issueId,
            logger,
            githubClient,
            githubConfig,
            baseBranch: existingPr.base.ref,
        });

        // Sync with PR's base branch after checkout
        const prBaseBranch = existingPr.base.ref;
        logger.info(`🔄 Synchronizing with PR base branch ${chalk.cyan(prBaseBranch)}`);
        await syncBaseBranch(prBaseBranch, logger);

        logger.info(`🎉 Successfully checked out existing branch for ${chalk.bold(issueId)}`);
    } else {
        // No open PR found - check if there's a merged PR and handle reopen flow
        logger.info(`📝 No open PR found. Checking for merged PRs...`);

        if (baseBranches.length === 0) {
            throw new UsageError('No base branches configured');
        }

        const selectedBaseBranch = baseBranches[0]!;

        // Get project information for PR title
        const project = await issueData.project;
        const projectName = project?.name || '';

        // Check for merged PRs and handle reopen flow
        const reopenResult = await handleMergedPrReopen({
            githubClient,
            githubConfig,
            issueId,
            logger,
            issueTitle: issueData.title,
            issueDescription: issueData.description || '',
            issueUrl: issueData.url,
            baseBranch: selectedBaseBranch,
            projectName,
            onReopenTask: async () => {
                await reopenLinearTask(linearClient, issueId, logger);
            },
        });

        if (reopenResult.reopened) {
            // Task was reopened with new version - we're done
            logger.info(`🔗 Linear task: ${chalk.underline(issueData.url)}`);
            return;
        }

        // No merged PR found - create new branch and PR
        logger.info(`📝 Creating new branch and draft PR...`);

        // Handle branch selection and stashing if needed
        const branchResult: BranchSelectionResult = await handleBranchSelection({
            baseBranches,
            taskId: issueId,
            logger,
        });

        const branchName =
            issueData.branchName ||
            `${issueId.toLowerCase()}-${issueData.title
                .toLowerCase()
                .replace(/[^a-z0-9]/g, '-')
                .replace(/-+/g, '-')
                .slice(0, 50)}`;

        const prTitle = projectName
            ? `[${issueId}][${projectName}] ${issueData.title}`
            : `[${issueId}] ${issueData.title}`;

        logger.info(`🌿 Creating branch: ${chalk.cyan(branchName)}`);

        const result = await createBranchAndPr({
            client: githubClient,
            config: githubConfig,
            branchName,
            prTitle,
            description: issueData.description || '',
            issueId,
            taskUrl: issueData.url,
            issueTitle: issueData.title,
            baseBranch: branchResult.selectedBaseBranch,
            startPoint: branchResult.startPoint,
        });

        // Apply stashed changes if any
        if (branchResult.stashName) {
            await applyStashedChanges(branchResult.stashName, logger);
        }

        logger.info(`✅ Created draft PR: ${chalk.blue(result.pr.title)} (#${result.pr.number})`);
        logger.info(`🔗 PR URL: ${chalk.blueBright(chalk.underline(result.pr.html_url))}`);
        logger.info(`🎉 Successfully created and checked out new branch for ${chalk.bold(issueId)}`);
    }

    // Move task to "In Progress" if it's in backlog/todo/triage.
    // Deferred until after checkout/create work has committed so we don't
    // transition the Linear state when the user cancels or a later step throws.
    await startTaskIfNotStarted(issueData, logger);

    // Show task URL for reference
    logger.info(`🔗 Linear task: ${chalk.underline(issueData.url)}`);
}
