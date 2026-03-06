import chalk from 'chalk';
import type { SimpleGit } from 'simple-git';
import { simpleGit } from 'simple-git';

import type { Logger } from '@nzyme/logging/Logger.js';

import { autoCommitChanges } from './autoCommitChanges.js';
import type { SubmoduleInfo } from './getSubmoduleInfo.js';
import { getSubmoduleInfo } from './getSubmoduleInfo.js';
import { isTaskBranch } from './isTaskBranch.js';
import { pushWithUpstream } from './pushWithUpstream.js';

/**
 * Parameters for synchronizing all repositories.
 */
export interface SyncAllReposParams {
    /**
     * Base branch name (e.g., 'main').
     */
    baseBranch: string;

    /**
     * Logger instance.
     */
    logger: Logger;

    /**
     * Default commit message for auto-committing pending changes.
     * @default 'Work in progress'
     */
    defaultCommitMessage?: string;
}

/**
 * Information about a synced submodule.
 */
export interface SyncedSubmoduleInfo {
    /**
     * The SubmoduleInfo from getSubmoduleInfo().
     */
    submodule: SubmoduleInfo;

    /**
     * Whether this submodule is on a task branch.
     */
    isOnTaskBranch: boolean;
}

/**
 * Result of synchronizing all repositories.
 */
export interface SyncAllReposResult {
    /**
     * All synced submodule info.
     */
    submodules: SyncedSubmoduleInfo[];
}

/**
 * Synchronize all repositories (main + submodules):
 * 1. Auto-commit pending changes in all repos (no prompting)
 * 2. Fetch all repos in parallel
 * 3. Rebase current branches (task branches: rebase; non-task: pull/ff)
 * 4. Fast-forward base branch in main + task-branch submodules
 */
export async function syncAllRepos(params: SyncAllReposParams): Promise<SyncAllReposResult> {
    const { baseBranch, logger, defaultCommitMessage = 'Work in progress' } = params;
    const mainGit = simpleGit();

    // === Phase 1: Detect submodules ===
    const submoduleInfos = await getSubmoduleInfo();

    const syncedSubmodules: SyncedSubmoduleInfo[] = submoduleInfos.map(sub => ({
        submodule: sub,
        isOnTaskBranch: isTaskBranch(sub.currentBranch),
    }));

    // === Phase 2: Auto-commit pending changes ===
    logger.info('');
    logger.info(chalk.bold('💾 Committing pending changes...'));

    let anyCommitted = false;

    const mainCommit = await autoCommitChanges({
        logger,
        git: mainGit,
        repoDisplayName: 'main repository',
        commitMessage: defaultCommitMessage,
    });
    if (mainCommit.committed) {
        anyCommitted = true;
    }

    for (const synced of syncedSubmodules) {
        const subGit = simpleGit({ baseDir: synced.submodule.path });
        const result = await autoCommitChanges({
            logger,
            git: subGit,
            repoDisplayName: chalk.magenta(synced.submodule.name),
            commitMessage: defaultCommitMessage,
        });
        if (result.committed) {
            anyCommitted = true;
        }
    }

    if (!anyCommitted) {
        logger.info('   No pending changes to commit');
    }

    // === Phase 3: Fetch all repos in parallel ===
    logger.info('');
    logger.info(chalk.bold('📡 Fetching all repositories...'));

    const mainBranch = (await mainGit.status()).current;
    const fetchPromises: Promise<void>[] = [];

    // Fetch main repo: current branch + base branch
    fetchPromises.push(fetchSafe(mainGit, 'origin', mainBranch));
    fetchPromises.push(fetchSafe(mainGit, 'origin', baseBranch));

    // Fetch each submodule
    for (const synced of syncedSubmodules) {
        const subGit = simpleGit({ baseDir: synced.submodule.path });
        fetchPromises.push(fetchSafe(subGit, 'origin', synced.submodule.currentBranch));
        if (synced.isOnTaskBranch) {
            fetchPromises.push(fetchSafe(subGit, 'origin', baseBranch));
        }
    }

    await Promise.all(fetchPromises);
    logger.info(
        `   ${chalk.green('✓')} Fetched ${chalk.yellow((1 + syncedSubmodules.length).toString())} repositor${syncedSubmodules.length === 0 ? 'y' : 'ies'}`,
    );

    // === Phase 4: Rebase/pull current branches ===
    logger.info('');
    logger.info(chalk.bold('📥 Syncing current branches...'));

    // Main repo (always on task branch) - rebase + push
    await rebaseAndPushCurrentBranch(mainGit, logger, 'main repository');

    // Each submodule
    for (const synced of syncedSubmodules) {
        const subGit = simpleGit({ baseDir: synced.submodule.path });
        if (synced.isOnTaskBranch) {
            await rebaseAndPushCurrentBranch(subGit, logger, chalk.magenta(synced.submodule.name));
        } else {
            await pullCurrentBranch(subGit, logger, chalk.magenta(synced.submodule.name));
        }
    }

    // === Phase 5: Fast-forward base branches ===
    logger.info('');
    logger.info(chalk.bold('⏩ Fast-forwarding base branches...'));

    await fastForwardBranch(mainGit, baseBranch, logger, 'main repository');

    for (const synced of syncedSubmodules) {
        if (synced.isOnTaskBranch) {
            const subGit = simpleGit({ baseDir: synced.submodule.path });
            await fastForwardBranch(subGit, baseBranch, logger, chalk.magenta(synced.submodule.name));
        }
    }

    return { submodules: syncedSubmodules };
}

/**
 * Fetch a branch from remote, ignoring errors (remote branch may not exist).
 */
async function fetchSafe(git: SimpleGit, remote: string, branch: string | undefined | null): Promise<void> {
    if (!branch) return;
    try {
        await git.fetch(remote, branch);
    } catch {
        // Remote branch may not exist yet - ignore
    }
}

/**
 * Rebase the current branch onto origin/<branch> and push.
 * Assumes fetch has already been done.
 */
async function rebaseAndPushCurrentBranch(git: SimpleGit, logger: Logger, repoDisplayName: string): Promise<void> {
    const status = await git.status();
    const currentBranch = status.current;

    if (!currentBranch) {
        logger.warn(`   ⚠️  Could not determine current branch in ${repoDisplayName}`);
        return;
    }

    // Check if remote has commits we don't have
    let commitsAhead = 0;
    try {
        const result = await git.raw(['rev-list', '--count', `${currentBranch}..origin/${currentBranch}`]);
        commitsAhead = parseInt(result.trim(), 10);
    } catch {
        // Remote branch may not exist yet
        return;
    }

    if (commitsAhead === 0) {
        logger.info(`   ${repoDisplayName}: up to date with remote`);
        return;
    }

    logger.info(
        `   ${repoDisplayName}: rebasing ${chalk.yellow(commitsAhead.toString())} commit${commitsAhead === 1 ? '' : 's'} from remote...`,
    );
    await git.pull('origin', currentBranch, { '--rebase': null });
    logger.info(`   ${chalk.green('✓')} Rebased ${repoDisplayName}`);

    // Push after rebase
    await pushWithUpstream(git);
    logger.info(`   ${chalk.green('✓')} Pushed ${repoDisplayName}`);
}

/**
 * Pull the current branch (fast-forward only) for non-task branches.
 * Assumes fetch has already been done.
 */
async function pullCurrentBranch(git: SimpleGit, logger: Logger, repoDisplayName: string): Promise<void> {
    const status = await git.status();
    const branch = status.current;

    if (!branch) {
        return;
    }

    // Check if remote has commits we don't have
    let commitsAhead = 0;
    try {
        const result = await git.raw(['rev-list', '--count', `${branch}..origin/${branch}`]);
        commitsAhead = parseInt(result.trim(), 10);
    } catch {
        // Remote branch may not exist
        return;
    }

    if (commitsAhead === 0) {
        logger.info(`   ${repoDisplayName}: up to date`);
        return;
    }

    logger.info(
        `   ${repoDisplayName}: pulling ${chalk.yellow(commitsAhead.toString())} commit${commitsAhead === 1 ? '' : 's'}...`,
    );

    try {
        await git.pull('origin', branch, { '--ff-only': null });
        logger.info(`   ${chalk.green('✓')} Pulled ${repoDisplayName}`);
    } catch {
        // Fast-forward failed (diverged history) - try regular pull
        await git.pull('origin', branch);
        logger.info(`   ${chalk.green('✓')} Pulled ${repoDisplayName} (merged)`);
    }
}

/**
 * Fast-forward a local branch ref to match origin/<branch> without checking it out.
 */
async function fastForwardBranch(
    git: SimpleGit,
    branch: string,
    logger: Logger,
    repoDisplayName: string,
): Promise<void> {
    try {
        await git.raw(['update-ref', `refs/heads/${branch}`, `refs/remotes/origin/${branch}`]);
        logger.info(`   ${chalk.green('✓')} Fast-forwarded ${chalk.cyan(branch)} in ${repoDisplayName}`);
    } catch {
        logger.warn(`   ⚠️  Could not fast-forward ${chalk.cyan(branch)} in ${repoDisplayName}`);
    }
}
