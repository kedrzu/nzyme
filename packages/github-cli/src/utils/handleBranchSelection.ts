import chalk from 'chalk';
import enquirer from 'enquirer';
import { simpleGit } from 'simple-git';

import type { Logger } from '@nzyme/logging/Logger.js';

import { getCurrentBranch } from './getCurrentBranch.js';

/**
 * Result of branch selection operation.
 */
export interface BranchSelectionResult {
    /**
     * The selected base branch to start from.
     */
    selectedBaseBranch: string;

    /**
     * The stash name if changes were stashed.
     */
    stashName?: string;

    /**
     * The point to start the new branch from (e.g. origin/main).
     */
    startPoint?: string;
}

/**
 * Parameters for branch selection.
 */
export interface BranchSelectionParams {
    /**
     * Available base branches to choose from.
     */
    baseBranches: string[];

    /**
     * Task/issue ID for stashing.
     */
    taskId: string;

    /**
     * Logger instance.
     */
    logger: Logger;

    /**
     * Optional existing PR to extract base branch from.
     */
    existingPr?: {
        base: {
            ref: string;
        };
    };
}

/**
 * Handle branch selection when multiple base branches are available.
 * For new tasks: shows current branch + all base branches
 * For existing tasks: uses PR base branch for sync, but still allows selection for new branches
 */
export async function handleBranchSelection(params: BranchSelectionParams): Promise<BranchSelectionResult> {
    const { baseBranches, taskId, logger, existingPr } = params;

    // If there's an existing PR, use its base branch for syncing
    if (existingPr) {
        logger.info(`🎯 Using PR base branch: ${chalk.cyan(existingPr.base.ref)}`);
        return {
            selectedBaseBranch: existingPr.base.ref,
        };
    }

    const currentBranch = await getCurrentBranch();

    // Build list of branch options
    const branchOptions: Array<{ message: string; name: string; value: string }> = [];

    // Add all base branches
    for (const baseBranch of baseBranches) {
        const isCurrent = currentBranch === baseBranch;
        const label = isCurrent ? `${baseBranch} (current, base branch)` : `${baseBranch} (base branch)`;
        const color = isCurrent ? chalk.green : chalk.cyan;

        branchOptions.push({
            message: color(label),
            name: baseBranch,
            value: baseBranch,
        });
    }

    // Add current branch if it's not one of the base branches
    if (!baseBranches.includes(currentBranch)) {
        branchOptions.push({
            message: `${chalk.yellow(currentBranch)} (current branch)`,
            name: 'current',
            value: currentBranch,
        });
    }

    // If only one option and it's the current branch, no need to prompt
    if (branchOptions.length === 1 && branchOptions[0]?.value === currentBranch) {
        return {
            selectedBaseBranch: currentBranch,
        };
    }

    // Ask user which branch to start from
    const { branchChoice } = await enquirer.prompt<{ branchChoice: string }>({
        type: 'select',
        name: 'branchChoice',
        message: 'Which branch do you want to start the new branch from?',
        choices: branchOptions,
    });

    const selectedBranch = branchChoice;

    // If user selected current branch, no need to switch
    if (selectedBranch === currentBranch) {
        logger.info(`🌿 Starting new branch from current branch: ${chalk.cyan(currentBranch)}`);
        return {
            selectedBaseBranch: selectedBranch,
        };
    }

    // User wants to start from a different branch
    logger.info(`🌿 Starting new branch from: ${chalk.cyan(selectedBranch)}`);

    const git = simpleGit();

    // Check if there are uncommitted changes
    const status = await git.status();
    const hasChanges = status.files.length > 0;

    let stashName: string | undefined;

    if (hasChanges) {
        // Stash changes before switching branches
        stashName = `task-${taskId}-stash`;
        logger.info(`📦 Stashing uncommitted changes as: ${chalk.cyan(stashName)}`);

        await git.stash(['push', '-u', '-m', stashName]);
        logger.info(`✅ Changes stashed successfully`);
    }

    // Fetch latest changes for selected branch
    logger.info(`🔄 Fetching latest changes for ${chalk.cyan(selectedBranch)}`);
    await git.fetch('origin', selectedBranch);

    return {
        selectedBaseBranch: selectedBranch,
        stashName,
        startPoint: `origin/${selectedBranch}`,
    };
}

/**
 * Apply previously stashed changes after creating a new branch.
 */
export async function applyStashedChanges(stashName: string, logger: Logger): Promise<void> {
    const git = simpleGit();

    try {
        // Find the stash by name
        const stashes = await git.stashList();
        const targetStashIndex = stashes.all.findIndex(stash => stash.message.includes(stashName));

        if (targetStashIndex === -1) {
            logger.warn(`⚠️  Could not find stash: ${chalk.cyan(stashName)}`);
            return;
        }

        // Apply the stash
        logger.info(`📦 Applying stashed changes: ${chalk.cyan(stashName)}`);
        await git.stash(['pop', `stash@{${targetStashIndex}}`]);
        logger.info(`✅ Stashed changes applied successfully`);
    } catch (error) {
        logger.error(`❌ Failed to apply stash ${chalk.cyan(stashName)}: ${(error as Error).message}`);
        logger.info(`💡 You can manually apply it later with: git stash list && git stash apply stash@{N}`);
    }
}
