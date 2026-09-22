import chalk from 'chalk';
import enquirer from 'enquirer';
import type { SimpleGit } from 'simple-git';
import { simpleGit } from 'simple-git';

import { UsageError } from '@nzyme/cli';
import type { Logger } from '@nzyme/logging/Logger.js';
import { assertValue } from '@nzyme/utils';

import type { GithubConfig } from '../GithubConfig.js';
import { assertNoConflicts } from './assertNoConflicts.js';
import { assertSubmoduleReady } from './assertSubmoduleReady.js';
import { autoCommitChanges } from './autoCommitChanges.js';
import type { GithubClient } from './createGithubClient.js';
import { decideSubmoduleOnTaskBranch } from './decideSubmoduleOnTaskBranch.js';
import type { SubmoduleReadiness } from './decideSubmoduleReadiness.js';
import { describeChangedPaths } from './describeChangedPaths.js';
import { getGitStatusInfo } from './getGitStatusInfo.js';
import type { SubmoduleInfo } from './getSubmoduleInfo.js';
import { getSubmoduleGithubConfig } from './getSubmoduleGithubConfig.js';
import { getSubmoduleInfo } from './getSubmoduleInfo.js';
import { handleMergeConflict } from './handleMergeConflict.js';
import { pushSubmoduleUpdates } from './pushSubmoduleUpdates.js';
import { pushWithUpstream } from './pushWithUpstream.js';
import { switchDetachedSubmoduleToBaseBranch } from './switchDetachedSubmoduleToBaseBranch.js';

/**
 * Parameters for synchronizing all repositories.
 */
export interface SyncAllReposParams {
    /**
     * The branch to merge **from** (e.g. 'main'), and the one fast-forwarded in every repository.
     * On a stacked task this is deliberately the parent node's branch rather than the project
     * trunk, so it is not a reliable answer to "is this a base branch" — see {@link baseBranches}.
     */
    baseBranch: string;

    /**
     * The caller project's base branches, used **only** to classify what a submodule is sitting on.
     * Kept apart from {@link baseBranch} because that one is a merge source: on a stacked task it
     * is a node branch, so classifying against it would read a submodule resting on the trunk as
     * task work and push to it.
     */
    baseBranches: string[];

    /**
     * Whether nobody can be asked a question — see `decideUnattendedMode`. A dirty submodule is
     * then refused with a `UsageError` instead of being prompted about; it is never committed
     * either way, because the message would be this repository's, not the submodule's.
     */
    unattended: boolean;

    /**
     * GitHub client used to look up each submodule's own pull request while judging its readiness.
     */
    githubClient: GithubClient;

    /**
     * GitHub configuration of the **main** repository. Only its token is used here: each
     * submodule's own owner/repo is derived from its remote URL via `getSubmoduleGithubConfig`.
     */
    githubConfig: GithubConfig;

    /**
     * Logger instance.
     */
    logger: Logger;

    /**
     * Default commit message for auto-committing pending changes **in the main repository**.
     * Submodules never receive it: a message generated here describes this repository's task, and
     * a submodule is an independent repository with its own commit conventions.
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
     * Whether this submodule carries the task's work — see `decideSubmoduleOnTaskBranch`. It is
     * both the classification used while syncing and the gate in front of the one step that writes
     * to a submodule's remote (Phase 5/6).
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
 * 1. Detect submodules
 * 2. Commit pending changes — the main repository automatically, each submodule only by asking its
 *    own question (or, unattended, by refusing) — then judge every submodule's readiness
 * 3. Fetch all repos in parallel (submodules fetched in full only when the main repo will integrate
 *    remote commits, so every replayed gitlink is local; otherwise each submodule fetches just its
 *    current + base branch)
 * 4. Rebase current branches (task branches: rebase; detached: switch onto base; non-task: pull/ff)
 * 5. Fast-forward base branch in main + task-branch submodules
 * 6. Merge base branch into task-branch submodules + push
 * 7. Commit & push all submodule reference updates (from rebase, pull, or merge)
 * 8. Merge base branch into main task branch + push
 */
export async function syncAllRepos(params: SyncAllReposParams): Promise<SyncAllReposResult> {
    const {
        baseBranch,
        baseBranches,
        unattended,
        githubClient,
        githubConfig,
        logger,
        defaultCommitMessage = 'Work in progress',
    } = params;
    // Disable submodule recursion for main-repo history operations: we manage every submodule's
    // working tree explicitly below. Left on, git would try to auto-fetch submodule gitlink commits
    // by SHA during rebase/merge — which real remotes reject — and check out submodule trees at
    // unexpected times, both of which produce spurious submodule conflicts.
    const mainGit = simpleGit({ config: ['submodule.recurse=false'] });

    // === Phase 1: Detect submodules ===
    const submoduleInfos = await getSubmoduleInfo();

    // === Phase 2: Commit pending changes ===
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

    // Submodules are deliberately NOT auto-committed. A submodule is an independent repository with
    // its own commit conventions, so a message generated for this repository's task has no business
    // in its history — and an auto-commit is an unasked-for write to someone else's repo. A human
    // gets asked instead; unattended, the readiness check below refuses and says what to do.
    const anySubmoduleCommitted = await commitSubmoduleChanges({ submodules: submoduleInfos, unattended, logger });
    if (anySubmoduleCommitted) {
        anyCommitted = true;
    }

    if (!anyCommitted) {
        logger.info('   No pending changes to commit');
    }

    // Re-read after the prompts: `hasChanges` and `unpushedCommitsCount` of anything just committed
    // are now stale, and readiness is judged from exactly those fields.
    const resolvedSubmodules = anySubmoduleCommitted ? await getSubmoduleInfo() : submoduleInfos;

    const syncedSubmodules = await classifySubmodules({
        submodules: resolvedSubmodules,
        baseBranches,
        unattended,
        githubClient,
        githubConfig,
        logger,
    });

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
            fetchPromises.push(
                subGit.fetch('origin').then(
                    () => undefined,
                    () => undefined,
                ),
            );
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

    // === Phase 7: Commit & push all submodule reference updates ===
    // Submodule refs may change from Phase 4 (rebase/pull) or Phase 6 (merge).
    // Detect and commit any changed gitlinks so the main repo stays clean.
    logger.info('');
    await pushSubmoduleUpdates({ logger });

    // === Phase 8: Merge base into main task branch + push ===
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
 * Inputs to {@link commitSubmoduleChanges}.
 */
interface CommitSubmoduleChangesParams {
    /**
     * Every submodule of the main repository, as detected in Phase 1.
     */
    submodules: SubmoduleInfo[];

    /**
     * Whether nobody can be asked — see `SyncAllReposParams.unattended`.
     */
    unattended: boolean;

    /**
     * Logger instance.
     */
    logger: Logger;
}

/**
 * Offer to commit each dirty submodule's working tree, one question per submodule.
 *
 * Unattended this does nothing at all — not even a refusal. The refusal belongs to
 * {@link classifySubmodules}, which produces the message naming the submodule, its branch and the
 * remedy; duplicating a weaker version of it here would only give the same problem two voices.
 * @param params The submodules to offer, plus the mode and logger.
 * @returns Whether any submodule was committed, so the caller knows its `SubmoduleInfo` is stale.
 */
async function commitSubmoduleChanges(params: CommitSubmoduleChangesParams): Promise<boolean> {
    const { submodules, unattended, logger } = params;

    if (unattended) {
        return false;
    }

    let anyCommitted = false;

    for (const submodule of submodules) {
        if (!submodule.hasChanges) {
            continue;
        }

        if (await promptCommitSubmodule({ submodule, logger })) {
            anyCommitted = true;
        }
    }

    return anyCommitted;
}

/**
 * Inputs to {@link promptCommitSubmodule}.
 */
interface PromptCommitSubmoduleParams {
    /**
     * The dirty submodule to ask about.
     */
    submodule: SubmoduleInfo;

    /**
     * Logger instance.
     */
    logger: Logger;
}

/**
 * Ask whether to commit one submodule's changes; the message itself is always generated from the
 * submodule's own changed paths, never typed by a human.
 *
 * A message is never invented for a repository that is not its own — `describeChangedPaths`
 * describes what actually changed in the submodule, which is a fact about that repository rather
 * than something the main repository is guessing on its behalf.
 * @param params The submodule to ask about, plus the logger.
 * @returns Whether a commit was created.
 */
async function promptCommitSubmodule(params: PromptCommitSubmoduleParams): Promise<boolean> {
    const { submodule, logger } = params;

    const git = simpleGit({ baseDir: submodule.path });
    const displayName = chalk.magenta(submodule.name);
    const statusInfo = await getGitStatusInfo(git);

    // A conflicted tree is never "changes to commit" — committing it would record the conflict
    // markers. Same guard the auto-commit path has always had before touching a working tree.
    if (statusInfo.changes.conflicted > 0) {
        await assertNoConflicts({ git, repoDisplayName: displayName, operation: 'merge', logger });
    }

    if (!statusInfo.hasUncommittedChanges) {
        return false;
    }

    logger.info(
        `   ${displayName}: ${chalk.yellow(statusInfo.totalChanges.toString())} uncommitted change${
            statusInfo.totalChanges === 1 ? '' : 's'
        } (${chalk.yellow(statusInfo.changeDescription)})`,
    );

    const { shouldCommit } = await enquirer.prompt<{ shouldCommit: 'no' | 'yes' }>({
        type: 'select',
        name: 'shouldCommit',
        message: `Commit ${statusInfo.totalChanges} change${statusInfo.totalChanges === 1 ? '' : 's'} in ${submodule.name}?`,
        choices: [
            {
                name: 'yes',
                message: `Yes, commit ${statusInfo.totalChanges} change${statusInfo.totalChanges === 1 ? '' : 's'}`,
            },
            {
                name: 'no',
                message: 'No, skip committing',
            },
        ],
    });

    if (shouldCommit === 'no') {
        logger.info(`   ${displayName}: skipping commit`);
        return false;
    }

    // `hasUncommittedChanges` above guarantees at least one changed path, so a description always
    // exists here — there is no invented default to fall back to.
    const message = assertValue(
        describeChangedPaths(statusInfo.changedPaths),
        'unreachable: hasUncommittedChanges implies at least one changed path',
    );

    await git.add('.');
    await git.commit(message);
    logger.info(`   ${chalk.green('✓')} Committed in ${displayName} with message: "${chalk.cyan(message)}"`);

    return true;
}

/**
 * Inputs to {@link classifySubmodules}.
 */
interface ClassifySubmodulesParams {
    /**
     * Every submodule of the main repository, with any prompted commit already reflected.
     */
    submodules: SubmoduleInfo[];

    /**
     * The caller project's base branches — see `SyncAllReposParams.baseBranches`.
     */
    baseBranches: string[];

    /**
     * Whether nobody can be asked — see `SyncAllReposParams.unattended`.
     */
    unattended: boolean;

    /**
     * GitHub client used to look up each submodule's own pull request.
     */
    githubClient: GithubClient;

    /**
     * GitHub configuration of the main repository; each submodule's own is derived from it.
     */
    githubConfig: GithubConfig;

    /**
     * Logger instance.
     */
    logger: Logger;
}

/**
 * Judge every submodule's readiness and turn the verdicts into the classification the rest of the
 * sync runs on.
 * @param params The submodules to judge, plus the base branches, mode and GitHub access.
 * @returns One entry per submodule, in the order they were detected.
 */
async function classifySubmodules(params: ClassifySubmodulesParams): Promise<SyncedSubmoduleInfo[]> {
    const { submodules, baseBranches, unattended, githubClient, githubConfig, logger } = params;

    const classified: SyncedSubmoduleInfo[] = [];

    for (const submodule of submodules) {
        const readiness = await judgeSubmodule({
            submodule,
            baseBranches,
            unattended,
            githubClient,
            githubConfig,
            logger,
        });

        classified.push({
            submodule,
            isOnTaskBranch: decideSubmoduleOnTaskBranch({
                readiness,
                currentBranch: submodule.currentBranch,
                detached: submodule.detached,
                baseBranches,
            }),
            isDetached: submodule.detached,
        });
    }

    return classified;
}

/**
 * Inputs to {@link judgeSubmodule}.
 */
interface JudgeSubmoduleParams {
    /**
     * The submodule to judge.
     */
    submodule: SubmoduleInfo;

    /**
     * The caller project's base branches — see `SyncAllReposParams.baseBranches`.
     */
    baseBranches: string[];

    /**
     * Whether nobody can be asked — see `SyncAllReposParams.unattended`.
     */
    unattended: boolean;

    /**
     * GitHub client used to look up the submodule's own pull request.
     */
    githubClient: GithubClient;

    /**
     * GitHub configuration of the main repository; the submodule's own is derived from it.
     */
    githubConfig: GithubConfig;

    /**
     * Logger instance.
     */
    logger: Logger;
}

/**
 * Run the readiness check for one submodule, with the mode deciding what a refusal means.
 *
 * Unattended, a refusal is fatal and propagates: the whole point of the check is that an agent
 * whose submodule is dirty, unpushed or PR-less has to be told so by name, not have the CLI guess.
 * With a human present the same refusal is a warning — being mid-flight in a submodule is a normal
 * thing for a person to be, so the sync carries on and simply treats the submodule as not carrying
 * task work, which keeps it out of the one step that would push to it.
 * @param params The submodule to judge, plus the base branches, mode and GitHub access.
 * @returns The verdict, or `null` when none could be reached.
 */
async function judgeSubmodule(params: JudgeSubmoduleParams): Promise<SubmoduleReadiness | null> {
    const { submodule, baseBranches, unattended, githubClient, githubConfig, logger } = params;

    const submoduleConfig = getSubmoduleGithubConfig(submodule.url, githubConfig.token);
    if (!submoduleConfig) {
        // Not a GitHub remote, so its pull requests cannot be looked up and readiness cannot be
        // judged. Warn rather than fail: the submodule is simply left alone from here on.
        logger.warn(`   ⚠️  ${chalk.magenta(submodule.name)}: not a GitHub remote, skipping its readiness check`);
        return null;
    }

    try {
        return await assertSubmoduleReady({
            submodule,
            baseBranches,
            githubClient,
            githubConfig: submoduleConfig,
        });
    } catch (error) {
        if (unattended || !(error instanceof UsageError)) {
            throw error;
        }

        logger.warn(`   ⚠️  ${chalk.magenta(submodule.name)}: ${error.message}`);
        return null;
    }
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
        return Number.parseInt(result.trim(), 10);
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
    let remoteAhead: number;
    let localAhead: number;
    try {
        const remoteResult = await git.raw(['rev-list', '--count', `${currentBranch}..origin/${currentBranch}`]);
        remoteAhead = Number.parseInt(remoteResult.trim(), 10);

        const localResult = await git.raw(['rev-list', '--count', `origin/${currentBranch}..${currentBranch}`]);
        localAhead = Number.parseInt(localResult.trim(), 10);
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
    let commitsAhead: number;
    try {
        const result = await git.raw(['rev-list', '--count', `${branch}..origin/${branch}`]);
        commitsAhead = Number.parseInt(result.trim(), 10);
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
        // `isOnTaskBranch` is only true for an attached HEAD on a non-base branch, so every
        // submodule reaching this loop has a branch to merge into and push.
        const currentBranch = assertValue(sub.currentBranch, `${sub.name} reached the merge with no current branch`);

        // Check if remote base branch is ahead of current branch
        let commitsAhead: number;
        try {
            const result = await subGit.raw(['rev-list', '--count', `${currentBranch}..${remoteBaseBranch}`]);
            commitsAhead = Number.parseInt(result.trim(), 10);
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

    let commitsAhead: number;
    try {
        const result = await git.raw(['rev-list', '--count', `${currentBranch}..${remoteBaseBranch}`]);
        commitsAhead = Number.parseInt(result.trim(), 10);
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
