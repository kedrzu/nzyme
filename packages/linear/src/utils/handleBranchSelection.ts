import chalk from 'chalk';
import enquirer from 'enquirer';
import { simpleGit } from 'simple-git';

import type { Logger } from '@nzyme/logging';

/**
 * Result of branch selection operation.
 */
export interface BranchSelectionResult {
    /**
     * Whether to start from base branch.
     */
    useBaseBranch: boolean;

    /**
     * The stash name if changes were stashed.
     */
    stashName?: string;
}

/**
 * Handle branch selection when creating a new branch with uncommitted changes.
 * @__NO_SIDE_EFFECTS__
 */
export async function handleBranchSelection(
    currentBranch: string,
    baseBranch: string,
    taskId: string,
    logger: Logger,
): Promise<BranchSelectionResult> {
    // If already on base branch, no selection needed
    if (currentBranch === baseBranch) {
        return { useBaseBranch: true };
    }

    const git = simpleGit();

    // Check if there are uncommitted changes
    const status = await git.status();
    const hasChanges = status.files.length > 0;

    // Ask user which branch to start from
    const { branchChoice } = await enquirer.prompt<{ branchChoice: string }>({
        type: 'select',
        name: 'branchChoice',
        message: 'Which branch do you want to start the new branch from?',
        choices: [
            {
                name: 'base',
                message: `${chalk.green(baseBranch)} (base branch)`,
                value: 'base',
            },
            {
                name: 'current',
                message: `${chalk.yellow(currentBranch)} (current branch)`,
                value: 'current',
            },
        ],
    });

    if (branchChoice === 'current') {
        // User wants to start from current branch
        logger.info(`🌿 Starting new branch from current branch: ${chalk.cyan(currentBranch)}`);
        return { useBaseBranch: false };
    }

    // User wants to start from base branch
    logger.info(`🌿 Starting new branch from base branch: ${chalk.cyan(baseBranch)}`);

    let stashName: string | undefined;

    if (hasChanges) {
        // Stash changes before switching to base branch
        stashName = `task-${taskId}-stash`;
        logger.info(`📦 Stashing uncommitted changes as: ${chalk.cyan(stashName)}`);

        await git.stash(['push', '-u', '-m', stashName]);
        logger.info(`✅ Changes stashed successfully`);
    }

    // Fetch latest changes for base branch
    logger.info(`🔄 Fetching latest changes for ${chalk.cyan(baseBranch)}`);
    await git.fetch('origin', baseBranch);

    // Checkout and fast-forward base branch
    logger.info(`🔄 Checking out and updating ${chalk.cyan(baseBranch)}`);
    await git.checkout(baseBranch);

    await git.pull('origin', baseBranch, { '--ff-only': null });
    logger.info(`✅ Fast-forwarded ${chalk.cyan(baseBranch)} to latest`);

    return { useBaseBranch: true, stashName };
}

/**
 * Apply previously stashed changes after creating a new branch.
 * @__NO_SIDE_EFFECTS__
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
