import chalk from 'chalk';
import type { SimpleGit } from 'simple-git';
import { simpleGit } from 'simple-git';

import type { Logger } from '@nzyme/logging/Logger.js';

import { assertNoConflicts } from './assertNoConflicts.js';
import { autoCommitChanges } from './autoCommitChanges.js';
import type { SubmoduleInfo } from './getSubmoduleInfo.js';
import { getSubmoduleInfo } from './getSubmoduleInfo.js';
import { handleMergeConflict } from './handleMergeConflict.js';
import { isTaskBranch } from './isTaskBranch.js';
import { pushSubmoduleUpdates } from './pushSubmoduleUpdates.js';
import { pushWithUpstream } from './pushWithUpstream.js';
import { switchDetachedSubmoduleToBaseBranch } from './switchDetachedSubmoduleToBaseBranch.js';

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

    /**
     * Whether this submodule is in a detached HEAD state (pinned to a commit, not on a branch).
     */
    isDetached: boolean;
}

/**
 * Result of synchronizing all repositories.
 */
export interface SyncAllReposResult {
    /**
     * All synced submodule info.
     */
    submodules: SyncedSubmoduleInfo[];

    /**
     * Whether the base branch was ahead of the main task branch.
     */
    wasBaseBranchAhead: boolean;

    /**
     * Whether a merge of the base branch into the main task branch was performed.
     */
    baseMergePerformed: boolean;

    /**
     * Number of commits the base branch was ahead (in main repo).
     */
    baseBranchCommitsAhead: number;
}

/**
 * Synchronize all repositories (main + submodules):
 * 1. Auto-commit pending changes in all repos (no prompting)
 * 2. Fetch all repos in parallel (submodules fetched in full only when the main repo will integrate
 *    remote commits, so every replayed gitlink is local; otherwise each submodule fetches just its
 *    current + base branch)
 * 3. Rebase current branches (task branches: rebase; detached: switch onto base; non-task: pull/ff)
 * 4. Fast-forward base branch in main + task-branch submodules
 * 5. Merge base branch into task-branch submodules + push
 * 6. Commit & push all submodule reference updates (from rebase, pull, or merge)
 * 7. Merge base branch into main task branch + push
 */
export async function syncAllRepos(params: SyncAllReposParams): Promise<SyncAllReposResult> {
    const { baseBranch, logger, defaultCommitMessage = 'Work in progress' } = params;
    // Disable submodule recursion for main-repo history operations: we manage every submodule's
    // working tree explicitly below. Left on, git would try to auto-fetch submodule gitlink commits
    // by SHA during rebase/merge — which real remotes reject — and check out submodule trees at
    // unexpected times, both of which produce spurious submodule conflicts.
    const mainGit = simpleGit({ config: ['submodule.recurse=false'] });

    // === Phase 1: Detect submodules ===
    const submoduleInfos = await getSubmoduleInfo();

    const syncedSubmodules: SyncedSubmoduleInfo[] = submoduleInfos.map(sub => ({
        submodule: sub,
        isOnTaskBranch: isTaskBranch(sub.currentBranch),
        isDetached: sub.detached,
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

    // Fetch the main repo's current + base branch first (cheap, single-branch fetches): we need
    // them locally to decide whether the main repo will integrate remote commits below.
    await Promise.all([fetchSafe(mainGit, 'origin', mainBranch), fetchSafe(mainGit, 'origin', baseBranch)]);

    // Decide how aggressively to fetch submodules. A full all-refs submodule fetch is only required
    // when the main repo actually integrates remote commits, because those operations replay/merge
    // main-repo commits whose gitlinks may point at submodule commits the local submodule has not
    // seen yet. If such a commit is missing, git's three-way gitlink merge fails with "commits not
    // present" and raises a spurious submodule conflict even when the gitlinks are trivially
    // fast-forwardable. The main repo integrates remote commits when:
    //   - origin/<mainBranch> is ahead of local <mainBranch> (Phase 4 rebase), OR
    //   - origin/<base> is ahead of <mainBranch> (Phase 7 base merge).
    // When neither holds, no foreign gitlinks get replayed, so each submodule only needs its own
    // current branch (for the rebase/pull/detached-parking in Phase 4) plus the base branch (for the
    // Phase 5/6 fast-forward + merge) — a much cheaper targeted fetch on large submodules.
    const mainNeedsIntegration =
        (await countCommitsAhead(mainGit, mainBranch, `origin/${mainBranch}`)) > 0 ||
        (await countCommitsAhead(mainGit, mainBranch, `origin/${baseBranch}`)) > 0;

    const fetchPromises: Promise<void>[] = [];

    for (const synced of syncedSubmodules) {
        const subGit = simpleGit({ baseDir: synced.submodule.path });
        if (mainNeedsIntegration) {
            // Full all-refs fetch guarantees every gitlink commit replayed by the main repo is local;
            // swallow errors (no remote / offline). The second .then arg resolves the rejection to void.
            fetchPromises.push(subGit.fetch('origin').then(() => {}, () => {}));
        } else {
            // Targeted fetch: only this submodule's current branch (null/detached → fetchSafe no-ops)
            // and the base branch are needed for Phase 4-6.
            fetchPromises.push(fetchSafe(subGit, 'origin', synced.submodule.currentBranch));
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
        const subName = chalk.magenta(synced.submodule.name);
        if (synced.isOnTaskBranch) {
            await rebaseAndPushCurrentBranch(subGit, logger, subName);
        } else if (synced.isDetached) {
            // Park detached submodules on the (up-to-date) base branch so the upcoming gitlink
            // merges in the main repo stay clean fast-forwards. Already fetched in Phase 3.
            await switchDetachedSubmoduleToBaseBranch({
                git: subGit,
                baseBranch,
                logger,
                repoDisplayName: subName,
            });
        } else {
            await pullCurrentBranch(subGit, logger, subName);
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

    // === Phase 6: Merge base into task-branch submodules + push ===
    const taskBranchSubmodules = syncedSubmodules.filter(s => s.isOnTaskBranch);

    if (taskBranchSubmodules.length > 0) {
        logger.info('');
        logger.info(chalk.bold('🔀 Merging base branch into submodules...'));

        await mergeBaseIntoSubmodules(taskBranchSubmodules, baseBranch, logger);
    }

    // === Phase 6b: Commit & push all submodule reference updates ===
    // Submodule refs may change from Phase 4 (rebase/pull) or Phase 6 (merge).
    // Detect and commit any changed gitlinks so the main repo stays clean.
    logger.info('');
    await pushSubmoduleUpdates({ logger });

    // === Phase 7: Merge base into main task branch + push ===
    logger.info('');
    logger.info(chalk.bold('🔀 Merging base branch into main repository...'));

    const { wasAhead, commitsAhead, merged } = await mergeBaseIntoCurrent(
        mainGit,
        baseBranch,
        logger,
        'main repository',
    );

    return {
        submodules: syncedSubmodules,
        wasBaseBranchAhead: wasAhead,
        baseMergePerformed: merged,
        baseBranchCommitsAhead: commitsAhead,
    };
}

/**
 * Fetch a branch from remote, ignoring errors (remote branch may not exist).
 */
async function fetchSafe(git: SimpleGit, remote: string, branch: string | null | undefined): Promise<void> {
    if (!branch) {
        return;
    }
    try {
        await git.fetch(remote, branch);
    } catch {
        // Remote branch may not exist yet - ignore
    }
}

/**
 * Count how many commits `to` is ahead of `from` (i.e. commits in `to` not in `from`),
 * mirroring the `rev-list --count` checks used by rebaseAndPushCurrentBranch / mergeBaseIntoCurrent.
 * Returns 0 when either ref is missing (e.g. the remote branch does not exist yet).
 */
async function countCommitsAhead(git: SimpleGit, from: string | null | undefined, to: string): Promise<number> {
    if (!from) {
        return 0;
    }
    try {
        const result = await git.raw(['rev-list', '--count', `${from}..${to}`]);
        return parseInt(result.trim(), 10);
    } catch {
        // One of the refs (typically the remote ref) does not exist yet - treat as 0-ahead.
        return 0;
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
    let remoteAhead = 0;
    let localAhead = 0;
    try {
        const remoteResult = await git.raw(['rev-list', '--count', `${currentBranch}..origin/${currentBranch}`]);
        remoteAhead = parseInt(remoteResult.trim(), 10);

        const localResult = await git.raw(['rev-list', '--count', `origin/${currentBranch}..${currentBranch}`]);
        localAhead = parseInt(localResult.trim(), 10);
    } catch {
        // Remote branch may not exist yet - push to create it
        await pushWithUpstream(git);
        logger.info(`   ${chalk.green('✓')} Pushed ${repoDisplayName} (new remote branch)`);
        return;
    }

    if (remoteAhead > 0) {
        logger.info(
            `   ${repoDisplayName}: rebasing ${chalk.yellow(remoteAhead.toString())} commit${remoteAhead === 1 ? '' : 's'} from remote...`,
        );

        try {
            await git.pull('origin', currentBranch, { '--rebase': null });
        } catch (error) {
            await handleMergeConflict({ git, repoDisplayName, operation: 'rebase', logger }, error);
        }

        await assertNoConflicts({ git, repoDisplayName, operation: 'rebase', logger });
        logger.info(`   ${chalk.green('✓')} Rebased ${repoDisplayName}`);

        await pushWithUpstream(git);
        logger.info(`   ${chalk.green('✓')} Pushed ${repoDisplayName}`);
    } else if (localAhead > 0) {
        logger.info(
            `   ${repoDisplayName}: pushing ${chalk.yellow(localAhead.toString())} local commit${localAhead === 1 ? '' : 's'}...`,
        );
        await pushWithUpstream(git);
        logger.info(`   ${chalk.green('✓')} Pushed ${repoDisplayName}`);
    } else {
        logger.info(`   ${repoDisplayName}: up to date with remote`);
    }
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
        try {
            await git.pull('origin', branch);
        } catch (error) {
            await handleMergeConflict({ git, repoDisplayName, operation: 'merge', logger }, error);
        }

        await assertNoConflicts({ git, repoDisplayName, operation: 'merge', logger });
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

/**
 * Merge base into task-branch submodules and push.
 */
async function mergeBaseIntoSubmodules(
    taskBranchSubmodules: SyncedSubmoduleInfo[],
    baseBranch: string,
    logger: Logger,
): Promise<void> {
    const remoteBaseBranch = `origin/${baseBranch}`;

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

        try {
            await subGit.merge([remoteBaseBranch]);
        } catch (error) {
            await handleMergeConflict(
                { git: subGit, repoDisplayName: chalk.magenta(sub.name), operation: 'merge', logger },
                error,
            );
        }

        await assertNoConflicts({ git: subGit, repoDisplayName: chalk.magenta(sub.name), operation: 'merge', logger });
        logger.info(`   ${chalk.green('✓')} Merged ${chalk.cyan(baseBranch)} into ${chalk.magenta(sub.name)}`);

        await pushWithUpstream(subGit);
        logger.info(`   ${chalk.green('✓')} Pushed ${chalk.magenta(sub.name)}`);
    }
}

/**
 * Check if base branch is ahead, merge it into current branch, and push.
 */
async function mergeBaseIntoCurrent(
    git: SimpleGit,
    baseBranch: string,
    logger: Logger,
    repoDisplayName: string,
): Promise<{ wasAhead: boolean; commitsAhead: number; merged: boolean }> {
    const status = await git.status();
    const currentBranch = status.current;
    const remoteBaseBranch = `origin/${baseBranch}`;

    if (!currentBranch) {
        return { wasAhead: false, commitsAhead: 0, merged: false };
    }

    let commitsAhead = 0;
    try {
        const result = await git.raw(['rev-list', '--count', `${currentBranch}..${remoteBaseBranch}`]);
        commitsAhead = parseInt(result.trim(), 10);
    } catch {
        return { wasAhead: false, commitsAhead: 0, merged: false };
    }

    if (commitsAhead === 0) {
        logger.info(`   ${repoDisplayName}: up to date with ${chalk.cyan(baseBranch)}`);
        return { wasAhead: false, commitsAhead: 0, merged: false };
    }

    logger.info(
        `   ${repoDisplayName}: ${chalk.cyan(baseBranch)} is ${chalk.yellow(commitsAhead.toString())} commit${commitsAhead === 1 ? '' : 's'} ahead`,
    );
    logger.info(`   Merging ${chalk.cyan(remoteBaseBranch)} into ${chalk.cyan(currentBranch)}...`);

    try {
        await git.merge([remoteBaseBranch]);
    } catch (error) {
        await handleMergeConflict({ git, repoDisplayName, operation: 'merge', logger }, error);
    }

    await assertNoConflicts({ git, repoDisplayName, operation: 'merge', logger });
    logger.info(`   ${chalk.green('✓')} Merged ${chalk.cyan(baseBranch)} into ${repoDisplayName}`);

    await pushWithUpstream(git);
    logger.info(`   ${chalk.green('✓')} Pushed ${repoDisplayName}`);

    return { wasAhead: true, commitsAhead, merged: true };
}
