import chalk from 'chalk';
import { simpleGit } from 'simple-git';

import type { Logger } from '@nzyme/logging/Logger.js';

import type { GithubConfig } from '../GithubConfig.js';
import { assertNoConflicts } from './assertNoConflicts.js';
import { findUpperNodeHeads } from './assertPushLeavesUpperNodesOpen.js';
import type { BranchGuard } from './createBranchGuard.js';
import { createBranchGuard } from './createBranchGuard.js';
import type { GithubClient } from './createGithubClient.js';
import { handleMergeConflict } from './handleMergeConflict.js';
import { parkSubmoduleOnBase } from './parkSubmoduleOnBase.js';
import { pushSubmoduleUpdates } from './pushSubmoduleUpdates.js';
import { pushWithUpstream } from './pushWithUpstream.js';

/**
 * Parameters for {@link refreshMainAfterSubmoduleMerge}.
 */
export interface RefreshMainAfterSubmoduleMergeParams {
    /**
     * The main task branch to refresh — the one the caller checked out for it (the bottom node of a
     * stack). Passed in rather than read from HEAD here: the caller's confirm prompt and submodule
     * check polling can take minutes, and another command in the same worktree may switch branches
     * meanwhile. Every write is guarded against this name, so such a switch is refused instead of
     * merging into and pushing whatever happens to be checked out.
     */
    taskBranch: string;

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
     * GitHub client used to look up the pull requests stacked on the main task branch before it is
     * pushed.
     */
    githubClient: GithubClient;

    /**
     * GitHub configuration of the main repository.
     */
    githubConfig: GithubConfig;

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
 *
 * @returns The main task branch HEAD SHA after refreshing — the commit the main PR's checks should
 * be gated on (see {@link waitForRequiredChecks}'s `expectedHeadSha`).
 */
export async function refreshMainAfterSubmoduleMerge(params: RefreshMainAfterSubmoduleMergeParams): Promise<string> {
    const {
        taskBranch,
        refreshedSubmodulePaths,
        baseBranch,
        submoduleBaseBranch = baseBranch,
        githubClient,
        githubConfig,
        logger,
    } = params;

    // Disable submodule recursion for main-repo history ops (mirrors syncAllRepos) so git does not try
    // to auto-fetch submodule gitlink commits by SHA during the base merge.
    const mainGit = simpleGit({ config: ['submodule.recurse=false'] });

    const guard = createBranchGuard({
        git: mainGit,
        branch: taskBranch,
        findUpperNodes: () => findUpperNodeHeads(githubClient, githubConfig, taskBranch),
    });
    // Checked up front too: step 2 moves submodule pointers in the working tree even when step 1
    // writes nothing, and must not leave them in a branch another command switched to.
    await guard.beforeWrite();

    // === Step 1: bring the main task branch up to date with base (if behind) ===
    logger.info('');
    logger.info(chalk.bold('🔄 Refreshing main repository before merge...'));

    const merged = await mergeBaseIntoMainIfBehind({ baseBranch, taskBranch, guard, logger, mainGit });

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
    await guard.beforeWrite();
    const pushResult = await pushSubmoduleUpdates({
        logger,
        submodulePaths: refreshedSubmodulePaths,
        beforePush: guard.beforePush,
    });

    // The base-merge commit from step 1 must reach the remote even when no gitlink changed.
    if (merged && !pushResult.pushed) {
        await guard.beforePush();
        await pushWithUpstream(mainGit);
        logger.info(`   ${chalk.green('✓')} Pushed base merge to main repository`);
    }

    // Report the resulting HEAD so the caller can gate the main PR's checks on this exact commit.
    return (await mainGit.revparse(['HEAD'])).trim();
}

/**
 * Inputs to {@link mergeBaseIntoMainIfBehind}.
 */
interface MergeBaseIntoMainIfBehindParams {
    /**
     * The branch to merge from.
     */
    baseBranch: string;

    /**
     * The main task branch being merged into — the one the caller checked out for the refresh.
     */
    taskBranch: string;

    /**
     * Guard of {@link taskBranch}, run before the merge.
     */
    guard: BranchGuard;

    /**
     * Logger instance.
     */
    logger: Logger;

    /**
     * Git instance of the main repository.
     */
    mainGit: ReturnType<typeof simpleGit>;
}

/**
 * Merge `origin/<baseBranch>` into the main task branch when it is behind. Returns whether a merge
 * commit was created.
 */
async function mergeBaseIntoMainIfBehind(params: MergeBaseIntoMainIfBehindParams): Promise<boolean> {
    const { baseBranch, taskBranch: currentBranch, guard, logger, mainGit } = params;

    await mainGit.fetch('origin', baseBranch);

    const remoteBase = `origin/${baseBranch}`;

    let commitsAhead: number;
    try {
        const result = await mainGit.raw(['rev-list', '--count', `${currentBranch}..${remoteBase}`]);
        commitsAhead = Number.parseInt(result.trim(), 10);
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

    await guard.beforeWrite();

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
