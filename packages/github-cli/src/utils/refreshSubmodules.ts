import chalk from 'chalk';
import { simpleGit } from 'simple-git';

import type { Logger } from '@nzyme/logging';

import { commitAndPushPendingChanges } from './commitAndPushPendingChanges.js';
import { getSubmoduleInfo } from './getSubmoduleInfo.js';

/**
 * Parameters for refreshing submodules.
 */
export interface RefreshSubmodulesParams {
    /**
     * Base branch to merge from.
     */
    baseBranch: string;

    /**
     * Logger instance.
     */
    logger: Logger;

    /**
     * Whether to skip prompts and automatically commit with default message.
     */
    autoYes?: boolean;
}

/**
 * Result of refreshing submodules.
 */
export interface RefreshSubmodulesResult {
    /**
     * Paths of submodules that were refreshed (merged).
     */
    refreshedSubmodules: string[];

    /**
     * Whether any submodules were pushed.
     */
    submodulesPushed: boolean;
}

/**
 * Refresh all submodules that are on task branches by merging the base branch and pushing.
 */
export async function refreshSubmodules(params: RefreshSubmodulesParams): Promise<RefreshSubmodulesResult> {
    const { baseBranch, logger, autoYes = false } = params;
    const refreshedSubmodules: string[] = [];
    let submodulesPushed = false;

    logger.info('🔍 Checking for submodules to refresh...');
    const submodules = await getSubmoduleInfo();

    if (submodules.length === 0) {
        logger.info('✅ No submodules found');
        return { refreshedSubmodules, submodulesPushed };
    }

    // Filter to submodules on task branches (branches containing task IDs like SIG-123)
    const submodulesToRefresh = submodules.filter(sub => sub.currentBranch && isTaskBranch(sub.currentBranch));

    if (submodulesToRefresh.length === 0) {
        logger.info('✅ No submodules on task branches to refresh');
        return { refreshedSubmodules, submodulesPushed };
    }

    logger.info(`📦 Found ${chalk.yellow(submodulesToRefresh.length.toString())} submodule(s) to refresh`);

    for (const submodule of submodulesToRefresh) {
        logger.info('');
        logger.info(`🔄 Refreshing submodule: ${chalk.magenta(submodule.name)}`);

        const submoduleGit = simpleGit({ baseDir: submodule.path });

        // 1. Check for uncommitted changes and prompt to commit/push before merge
        await commitAndPushPendingChanges({
            logger,
            git: submoduleGit,
            repoDisplayName: chalk.magenta(submodule.name),
            autoYes,
            defaultCommitMessage: 'Work in progress',
        });

        // 2. Fetch and fast-forward base branch
        logger.info(`   🔄 Fetching latest changes for ${chalk.cyan(baseBranch)}`);
        await submoduleGit.fetch('origin', baseBranch);

        try {
            await submoduleGit.raw(['update-ref', `refs/heads/${baseBranch}`, `refs/remotes/origin/${baseBranch}`]);
            logger.info(`   ✅ Fast-forwarded ${chalk.cyan(baseBranch)} to latest`);
        } catch (error) {
            logger.warn(`   ⚠️  Could not fast-forward ${chalk.cyan(baseBranch)}: ${(error as Error).message}`);
        }

        // 3. Check if base branch is ahead of current branch
        const currentBranch = submodule.currentBranch!;
        let commitsAhead = 0;
        try {
            const result = await submoduleGit.raw(['rev-list', '--count', `${currentBranch}..${baseBranch}`]);
            commitsAhead = parseInt(result.trim(), 10);
        } catch {
            commitsAhead = 0;
        }

        if (commitsAhead === 0) {
            logger.info(`   ✅ ${chalk.magenta(submodule.name)} is up to date with ${chalk.cyan(baseBranch)}`);
            continue;
        }

        logger.info(
            `   📊 Base branch is ${chalk.yellow(commitsAhead.toString())} commit${commitsAhead === 1 ? '' : 's'} ahead`,
        );

        // 4. Merge base branch
        logger.info(`   🔀 Merging ${chalk.cyan(baseBranch)} into ${chalk.cyan(currentBranch)}`);
        await submoduleGit.merge([baseBranch]);
        logger.info(`   ✅ Successfully merged ${chalk.cyan(baseBranch)}`);

        refreshedSubmodules.push(submodule.path);

        // 5. Push the merged changes
        logger.info(`   📤 Pushing merged changes...`);
        await submoduleGit.push();
        logger.info(`   ✅ Pushed ${chalk.magenta(submodule.name)}`);
        submodulesPushed = true;
    }

    return { refreshedSubmodules, submodulesPushed };
}

/**
 * Check if a branch name appears to be a task/issue branch.
 */
function isTaskBranch(branchName: string): boolean {
    // Check for branches containing task IDs like SIG-123, PROJ-456, etc. (case-insensitive)
    const taskIdPattern = /[A-Z]+-\d+/i;
    return taskIdPattern.test(branchName);
}
