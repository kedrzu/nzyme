import chalk from 'chalk';
import { simpleGit } from 'simple-git';

import type { Logger } from '@nzyme/logging/Logger.js';

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
     * The base branch to start the new branch from (e.g. 'main').
     * New task branches always start from the up-to-date remote tip of this branch,
     * regardless of the currently checked-out branch.
     */
    branch: string;

    /**
     * Task/issue ID for stashing.
     */
    taskId: string;

    /**
     * Logger instance.
     */
    logger: Logger;
}

/**
 * Prepare the starting point for a new task branch.
 *
 * Always branches from the up-to-date remote tip of the given base branch
 * (e.g. `origin/main`) rather than the currently checked-out branch, stashing
 * any uncommitted changes first so they can be re-applied on the new branch.
 */
export async function handleBranchSelection(params: BranchSelectionParams): Promise<BranchSelectionResult> {
    const { branch, taskId, logger } = params;

    logger.info(`🌿 Starting new branch from: ${chalk.cyan(branch)}`);

    const git = simpleGit();

    // Stash uncommitted changes before switching branches so nothing is lost.
    const status = await git.status();
    const hasChanges = status.files.length > 0;

    let stashName: string | undefined;

    if (hasChanges) {
        stashName = `task-${taskId}-stash`;
        logger.info(`📦 Stashing uncommitted changes as: ${chalk.cyan(stashName)}`);

        await git.stash(['push', '-u', '-m', stashName]);
        logger.info(`✅ Changes stashed successfully`);
    }

    // Fetch the base branch so the new branch is cut from an up-to-date remote tip.
    logger.info(`🔄 Fetching latest changes for ${chalk.cyan(branch)}`);
    await git.fetch('origin', branch);

    return {
        selectedBaseBranch: branch,
        stashName,
        startPoint: `origin/${branch}`,
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
