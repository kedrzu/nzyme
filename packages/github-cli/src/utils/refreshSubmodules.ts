import chalk from 'chalk';
import { simpleGit } from 'simple-git';

import type { Logger } from '@nzyme/logging/Logger.js';

import { commitAndPushPendingChanges } from './commitAndPushPendingChanges.js';
import { fetchAndRebaseCurrentBranch } from './fetchAndRebaseCurrentBranch.js';
import { getSubmoduleInfo } from './getSubmoduleInfo.js';
import { isTaskBranch } from './isTaskBranch.js';
import { pushWithUpstream } from './pushWithUpstream.js';

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
}

/**
 * Refresh all submodules that are on task branches by merging the base branch and pushing.
 */
export async function refreshSubmodules(params: RefreshSubmodulesParams): Promise<RefreshSubmodulesResult> {
    const { baseBranch, logger, autoYes = false } = params;
    const refreshedSubmodules: string[] = [];
    const remoteBaseBranch = `origin/${baseBranch}`;

    logger.info('🔍 Checking for submodules to refresh...');
    const submodules = await getSubmoduleInfo();

    if (submodules.length === 0) {
        logger.info('✅ No submodules found');
        return { refreshedSubmodules };
    }

    // Filter to submodules on task branches (branches containing task IDs like SIG-123)
    const submodulesToRefresh = submodules.filter(sub => sub.currentBranch && isTaskBranch(sub.currentBranch));

    if (submodulesToRefresh.length === 0) {
        logger.info('✅ No submodules on task branches to refresh');
        return { refreshedSubmodules };
    }

    logger.info(`📦 Found ${chalk.yellow(submodulesToRefresh.length.toString())} submodule(s) to refresh`);

    for (const submodule of submodulesToRefresh) {
        logger.info('');
        logger.info(`🔄 Refreshing submodule: ${chalk.magenta(submodule.name)}`);

        const submoduleGit = simpleGit({ baseDir: submodule.path });

        const currentBranch = submodule.currentBranch!;

        // 1. Fetch and rebase current branch to get any remote commits
        await fetchAndRebaseCurrentBranch({
            logger,
            git: submoduleGit,
            repoDisplayName: chalk.magenta(submodule.name),
        });

        // 2. Check for uncommitted changes and prompt to commit/push before merge
        await commitAndPushPendingChanges({
            logger,
            git: submoduleGit,
            repoDisplayName: chalk.magenta(submodule.name),
            autoYes,
            defaultCommitMessage: 'Work in progress',
        });

        // 3. Fetch and fast-forward base branch
        logger.info(`   🔄 Fetching latest changes for ${chalk.cyan(baseBranch)}`);
        await submoduleGit.fetch('origin', baseBranch);

        try {
            await submoduleGit.raw(['update-ref', `refs/heads/${baseBranch}`, `refs/remotes/origin/${baseBranch}`]);
            logger.info(`   ✅ Fast-forwarded ${chalk.cyan(baseBranch)} to latest`);
        } catch (error) {
            logger.warn(`   ⚠️  Could not fast-forward ${chalk.cyan(baseBranch)}: ${(error as Error).message}`);
        }

        // 4. Check if remote base branch is ahead of current branch
        let commitsAhead = 0;
        try {
            // Use origin/baseBranch to ensure we check against freshly fetched content
            const result = await submoduleGit.raw(['rev-list', '--count', `${currentBranch}..${remoteBaseBranch}`]);
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

        // 5. Merge remote base branch (use origin/baseBranch to ensure freshly fetched content)
        logger.info(`   🔀 Merging ${chalk.cyan(remoteBaseBranch)} into ${chalk.cyan(currentBranch)}`);
        await submoduleGit.merge([remoteBaseBranch]);
        logger.info(`   ✅ Successfully merged ${chalk.cyan(baseBranch)}`);

        refreshedSubmodules.push(submodule.path);

        // 6. Push the merged changes (handles case where no upstream is configured)
        logger.info(`   📤 Pushing merged changes...`);
        await pushWithUpstream(submoduleGit);
        logger.info(`   ✅ Pushed ${chalk.magenta(submodule.name)}`);
    }

    return { refreshedSubmodules };
}

