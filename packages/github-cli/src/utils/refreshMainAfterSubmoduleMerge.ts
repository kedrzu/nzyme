import chalk from 'chalk';
import { simpleGit } from 'simple-git';

import type { Logger } from '@nzyme/logging/Logger.js';

import { assertNoConflicts } from './assertNoConflicts.js';
import { handleMergeConflict } from './handleMergeConflict.js';
import { parkSubmoduleOnBase } from './parkSubmoduleOnBase.js';
import { pushSubmoduleUpdates } from './pushSubmoduleUpdates.js';
import { pushWithUpstream } from './pushWithUpstream.js';

/**
 * Parameters for {@link refreshMainAfterSubmoduleMerge}.
 */
export interface RefreshMainAfterSubmoduleMergeParams {
    /**
     * Paths of submodules whose PRs were merged for this task and must now be re-pointed at their
     * merged base-branch commit. May be empty (no submodule PRs).
     */
    refreshedSubmodulePaths: string[];

    /**
     * Base branch of the main repository (e.g. 'main').
     */
    baseBranch: string;

    /**
     * Base branch of the submodules. Defaults to {@link baseBranch}.
     */
    submoduleBaseBranch?: string;

    /**
     * Logger instance.
     */
    logger: Logger;
}

/**
 * Refresh the main repository's task branch after its submodule PR(s) have been squash-merged, so the
 * main PR can be merged cleanly:
 * 1. Merge the base branch into the main task branch if it is behind (avoids `mergeable_state: behind`
 *    on the main PR). Runs even when there are no submodules.
 * 2. Park each merged submodule on its merged base-branch tip (the squash commit).
 * 3. Commit and push the resulting submodule gitlink updates (and any base-merge commit) so the main
 *    PR's head reflects the merged submodule references.
 *
 * Idempotent: re-running parks submodules already on base and pushes nothing new when the gitlinks
 * already match.
 */
export async function refreshMainAfterSubmoduleMerge(params: RefreshMainAfterSubmoduleMergeParams): Promise<void> {
    const { refreshedSubmodulePaths, baseBranch, submoduleBaseBranch = baseBranch, logger } = params;

    // Disable submodule recursion for main-repo history ops (mirrors syncAllRepos) so git does not try
    // to auto-fetch submodule gitlink commits by SHA during the base merge.
    const mainGit = simpleGit({ config: ['submodule.recurse=false'] });

    // === Step 1: bring the main task branch up to date with base (if behind) ===
    logger.info('');
    logger.info(chalk.bold('🔄 Refreshing main repository before merge...'));

    const merged = await mergeBaseIntoMainIfBehind(baseBranch, logger, mainGit);

    // === Step 2: park each merged submodule on its merged base tip ===
    for (const path of refreshedSubmodulePaths) {
        const subGit = simpleGit({ baseDir: path });
        await parkSubmoduleOnBase({
            git: subGit,
            baseBranch: submoduleBaseBranch,
            logger,
            repoDisplayName: chalk.magenta(path),
        });
    }

    // === Step 3: commit & push the gitlink updates ===
    const pushResult = await pushSubmoduleUpdates({ logger, submodulePaths: refreshedSubmodulePaths });

    // The base-merge commit from step 1 must reach the remote even when no gitlink changed.
    if (merged && !pushResult.pushed) {
        await pushWithUpstream(mainGit);
        logger.info(`   ${chalk.green('✓')} Pushed base merge to main repository`);
    }
}

/**
 * Merge `origin/<baseBranch>` into the current main task branch when it is behind. Returns whether a
 * merge commit was created.
 */
async function mergeBaseIntoMainIfBehind(
    baseBranch: string,
    logger: Logger,
    mainGit: ReturnType<typeof simpleGit>,
): Promise<boolean> {
    await mainGit.fetch('origin', baseBranch);

    const status = await mainGit.status();
    const currentBranch = status.current;
    if (!currentBranch) {
        logger.warn('   ⚠️  Could not determine current branch in main repository');
        return false;
    }

    const remoteBase = `origin/${baseBranch}`;

    let commitsAhead = 0;
    try {
        const result = await mainGit.raw(['rev-list', '--count', `${currentBranch}..${remoteBase}`]);
        commitsAhead = parseInt(result.trim(), 10);
    } catch {
        commitsAhead = 0;
    }

    if (commitsAhead === 0) {
        logger.info(`   main repository: up to date with ${chalk.cyan(baseBranch)}`);
        return false;
    }

    logger.info(
        `   Merging ${chalk.cyan(remoteBase)} into ${chalk.cyan(currentBranch)} ` +
            `(${chalk.yellow(commitsAhead.toString())} commit${commitsAhead === 1 ? '' : 's'} behind)...`,
    );

    try {
        await mainGit.merge([remoteBase]);
    } catch (error) {
        await handleMergeConflict(
            { git: mainGit, repoDisplayName: 'main repository', operation: 'merge', logger },
            error,
        );
    }

    await assertNoConflicts({ git: mainGit, repoDisplayName: 'main repository', operation: 'merge', logger });
    logger.info(`   ${chalk.green('✓')} Merged ${chalk.cyan(baseBranch)} into main repository`);

    return true;
}
