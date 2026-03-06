import chalk from 'chalk';
import { simpleGit } from 'simple-git';

import type { Logger } from '@nzyme/logging/Logger.js';

import { pushWithUpstream } from './pushWithUpstream.js';
import type { SyncedSubmoduleInfo } from './syncAllRepos.js';

/**
 * Parameters for merging base branch into task-branch submodules.
 */
export interface MergeBaseIntoSubmodulesParams {
    /**
     * Base branch name (e.g., 'main').
     */
    baseBranch: string;

    /**
     * Logger instance.
     */
    logger: Logger;

    /**
     * Synced submodule info from syncAllRepos.
     */
    submodules: SyncedSubmoduleInfo[];
}

/**
 * Result of merging base into submodules.
 */
export interface MergeBaseIntoSubmodulesResult {
    /**
     * Paths of submodules that had base branch merged.
     */
    mergedSubmodulePaths: string[];
}

/**
 * For each task-branch submodule, check if the base branch is ahead,
 * merge it into the current branch, and push.
 */
export async function mergeBaseIntoSubmodules(
    params: MergeBaseIntoSubmodulesParams,
): Promise<MergeBaseIntoSubmodulesResult> {
    const { baseBranch, logger, submodules } = params;
    const remoteBaseBranch = `origin/${baseBranch}`;
    const mergedSubmodulePaths: string[] = [];

    const taskBranchSubmodules = submodules.filter(s => s.isOnTaskBranch);

    if (taskBranchSubmodules.length === 0) {
        logger.info('   No submodules on task branches to merge');
        return { mergedSubmodulePaths };
    }

    for (const synced of taskBranchSubmodules) {
        const sub = synced.submodule;
        const subGit = simpleGit({ baseDir: sub.path });
        const currentBranch = sub.currentBranch!;

        // Check if remote base branch is ahead of current branch
        let commitsAhead = 0;
        try {
            const result = await subGit.raw(['rev-list', '--count', `${currentBranch}..${remoteBaseBranch}`]);
            commitsAhead = parseInt(result.trim(), 10);
        } catch {
            commitsAhead = 0;
        }

        if (commitsAhead === 0) {
            logger.info(`   ${chalk.magenta(sub.name)}: up to date with ${chalk.cyan(baseBranch)}`);
            continue;
        }

        logger.info(
            `   ${chalk.magenta(sub.name)}: ${chalk.cyan(baseBranch)} is ${chalk.yellow(commitsAhead.toString())} commit${commitsAhead === 1 ? '' : 's'} ahead`,
        );
        logger.info(`   Merging ${chalk.cyan(remoteBaseBranch)} into ${chalk.cyan(currentBranch)}...`);
        await subGit.merge([remoteBaseBranch]);
        logger.info(`   ${chalk.green('✓')} Merged ${chalk.cyan(baseBranch)} into ${chalk.magenta(sub.name)}`);

        logger.info(`   Pushing ${chalk.magenta(sub.name)}...`);
        await pushWithUpstream(subGit);
        logger.info(`   ${chalk.green('✓')} Pushed ${chalk.magenta(sub.name)}`);

        mergedSubmodulePaths.push(sub.path);
    }

    return { mergedSubmodulePaths };
}
