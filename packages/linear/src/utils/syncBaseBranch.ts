import chalk from 'chalk';
import enquirer from 'enquirer';
import { simpleGit } from 'simple-git';

import type { Logger } from '@nzyme/logging';

/**
 * Result of base branch synchronization operation.
 */
export interface SyncBaseBranchResult {
    /**
     * Whether the base branch was ahead of the current branch.
     */
    wasBaseBranchAhead: boolean;

    /**
     * Whether a merge was performed.
     */
    mergePerformed: boolean;

    /**
     * Number of commits that the base branch was ahead.
     */
    commitsAhead?: number;
}

/**
 * Fetch and fast-forward the base branch to latest.
 * @__NO_SIDE_EFFECTS__
 */
export async function fetchAndFastForwardBaseBranch(baseBranch: string, logger: Logger): Promise<void> {
    const git = simpleGit();

    logger.info(`🔄 Fetching latest changes for ${chalk.cyan(baseBranch)}`);
    await git.fetch('origin', baseBranch);

    try {
        // Fast-forward local base branch to match origin without checking out
        logger.info(`🔄 Fast-forwarding ${chalk.cyan(baseBranch)}`);
        await git.raw(['update-ref', `refs/heads/${baseBranch}`, `refs/remotes/origin/${baseBranch}`]);
        logger.info(`✅ Fast-forwarded ${chalk.cyan(baseBranch)} to latest`);
    } catch (error) {
        logger.warn(`⚠️  Could not fast-forward ${chalk.cyan(baseBranch)}: ${(error as Error).message}`);
    }
}

/**
 * Check if the base branch is ahead of the current branch.
 * @__NO_SIDE_EFFECTS__
 */
export async function checkBaseBranchAhead(baseBranch: string) {
    const git = simpleGit();

    try {
        // Get the current branch
        const status = await git.status();
        const currentBranch = status.current;

        if (!currentBranch) {
            throw new Error('Could not determine current branch');
        }

        // Get commits that are in base branch but not in current branch
        // Use rev-list to count commits between currentBranch and baseBranch
        const result = await git.raw(['rev-list', '--count', `${currentBranch}..${baseBranch}`]);

        const commitsAhead = parseInt(result.trim(), 10);
        const isAhead = commitsAhead > 0;

        return { isAhead, commitsAhead };
    } catch {
        // If there's an error (e.g., no common history), assume not ahead
        return { isAhead: false, commitsAhead: 0 };
    }
}

/**
 * Prompt user whether to merge base branch into current branch.
 * @__NO_SIDE_EFFECTS__
 */
export async function promptForBaseBranchMerge(baseBranch: string, commitsAhead: number) {
    const { mergeChoice } = await enquirer.prompt<{ mergeChoice: string }>({
        type: 'select',
        name: 'mergeChoice',
        message: `Base branch ${chalk.cyan(baseBranch)} is ${chalk.yellow(
            commitsAhead.toString(),
        )} commit${commitsAhead === 1 ? '' : 's'} ahead. What do you want to do?`,
        choices: [
            {
                name: 'merge',
                message: `${chalk.green('Merge')} base branch into current branch`,
                value: 'merge',
            },
            {
                name: 'skip',
                message: `${chalk.yellow('Skip')} merge for now`,
                value: 'skip',
            },
        ],
        initial: 0, // Default to merge (first option)
    });

    return { shouldMerge: mergeChoice === 'merge' };
}

/**
 * Merge base branch into current branch.
 * @__NO_SIDE_EFFECTS__
 */
export async function mergeBaseBranch(baseBranch: string, logger: Logger): Promise<void> {
    const git = simpleGit();

    try {
        logger.info(`🔀 Merging ${chalk.cyan(baseBranch)} into current branch`);
        await git.merge([baseBranch]);
        logger.info(`✅ Successfully merged ${chalk.cyan(baseBranch)}`);
    } catch (error) {
        logger.error(`❌ Failed to merge ${chalk.cyan(baseBranch)}: ${(error as Error).message}`);
        logger.info(`💡 You may need to resolve conflicts manually`);
        throw error;
    }
}

/**
 * Complete synchronization flow: fetch base branch, check if ahead, and optionally merge.
 * @__NO_SIDE_EFFECTS__
 */
export async function syncBaseBranch(
    baseBranch: string,
    logger: Logger,
    skipPrompt: boolean = false,
): Promise<SyncBaseBranchResult> {
    // First, fetch and fast-forward the base branch
    await fetchAndFastForwardBaseBranch(baseBranch, logger);

    // Check if base branch is ahead
    const { isAhead, commitsAhead } = await checkBaseBranchAhead(baseBranch);

    if (!isAhead) {
        logger.info(`✅ Current branch is up to date with ${chalk.cyan(baseBranch)}`);
        return {
            wasBaseBranchAhead: false,
            mergePerformed: false,
        };
    }

    logger.info(
        `📊 Base branch ${chalk.cyan(baseBranch)} is ${chalk.yellow(commitsAhead.toString())} commit${
            commitsAhead === 1 ? '' : 's'
        } ahead`,
    );

    // If skipPrompt is true, merge automatically
    let shouldMerge = skipPrompt;

    if (!skipPrompt) {
        const promptResult = await promptForBaseBranchMerge(baseBranch, commitsAhead);
        shouldMerge = promptResult.shouldMerge;
    }

    if (shouldMerge) {
        await mergeBaseBranch(baseBranch, logger);
        return {
            wasBaseBranchAhead: true,
            mergePerformed: true,
            commitsAhead,
        };
    }

    logger.info(`⏭️  Skipping merge of ${chalk.cyan(baseBranch)}`);
    return {
        wasBaseBranchAhead: true,
        mergePerformed: false,
        commitsAhead,
    };
}
