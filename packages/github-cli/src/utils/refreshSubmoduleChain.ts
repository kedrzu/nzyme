import chalk from 'chalk';
import type { SimpleGit } from 'simple-git';
import { simpleGit } from 'simple-git';

import { UsageError } from '@nzyme/cli';
import type { Logger } from '@nzyme/logging/Logger.js';
import { assertValue } from '@nzyme/utils';

import type { GithubConfig } from '../GithubConfig.js';
import { assertNoConflicts } from './assertNoConflicts.js';
import { cascadeStack } from './cascadeStack.js';
import { countCommits } from './countCommits.js';
import type { GithubClient } from './createGithubClient.js';
import { ensureLocalBranch } from './ensureLocalBranch.js';
import { getCurrentBranch } from './getCurrentBranch.js';
import { GitMergeConflictError } from './GitMergeConflictError.js';
import type { SubmoduleInfo } from './getSubmoduleInfo.js';
import { getSubmoduleInfo } from './getSubmoduleInfo.js';
import { handleMergeConflict } from './handleMergeConflict.js';
import { resolveSubmodulePrChain } from './resolveSubmodulePrChain.js';
import { rethrowWithStackPosition } from './rethrowWithStackPosition.js';
import { syncStackNodesFromRemote } from './syncStackNodesFromRemote.js';

/**
 * Local git config key, in the submodule's own repository, holding the branch a chain refresh
 * started from for as long as the refresh may leave the submodule on another node of the chain.
 */
const REFRESH_HOME_KEY = 'nzyme.refreshHome';

/**
 * Local git config key, next to {@link REFRESH_HOME_KEY}, holding the main repository's branch the
 * refresh ran for. Home belongs to that branch's task only: once the main repository is on another
 * branch, taking the submodule home would give that branch the other task's submodule work.
 */
const REFRESH_PARENT_KEY = 'nzyme.refreshParent';

/**
 * A submodule pull request a chain refresh brought up to date, with the head it left there.
 */
export interface RefreshedSubmodulePr {
    /**
     * Display name of the submodule.
     */
    submoduleName: string;

    /**
     * GitHub configuration of the submodule's own repository.
     */
    githubConfig: GithubConfig;

    number: number;

    headRef: string;

    /**
     * The commit the node's remote branch holds after the refresh — what GitHub has to report as
     * the pull request's head before its mergeability says anything about this refresh.
     */
    headSha: string;
}

/**
 * Parameters for {@link refreshSubmoduleChain}.
 */
export interface RefreshSubmoduleChainParams {
    /**
     * The submodule, checked out on its task branch.
     */
    submodule: SubmoduleInfo;

    /**
     * The trunk the submodules follow.
     */
    trunk: string;

    /**
     * GitHub client used to look up the chain.
     */
    githubClient: GithubClient;

    /**
     * GitHub configuration of the submodule's OWN repository.
     */
    githubConfig: GithubConfig;

    /**
     * Logger instance.
     */
    logger: Logger;
}

/**
 * Bring a submodule's chain of pull requests up to date with the trunk, the way `refreshStack`
 * does for the main repository's stack: the trunk goes into the bottom node only and is carried up
 * node by node. Merging it straight into the checked-out branch instead, when that branch sits on
 * other open pull requests, makes the trunk's commits part of that branch's own diff — and GitHub
 * replaying the stack node by node onto the trunk then conflicts where a plain merge would not.
 *
 * Every node still ahead of its remote is pushed, merged this run or not: a node whose conflict was
 * resolved and committed by hand already contains its parent, so nothing else would push it, and
 * the node above would then be pushed on top of commits its base lacks on the remote.
 *
 * The submodule ends on the branch it started from ("home"), so the caller commits the gitlink at
 * home's refreshed head. Home is recorded, with the main repository's branch it belongs to, before
 * the first checkout and cleared once the submodule is back on it, so that
 * {@link restoreSubmoduleHomes} takes the next run back there before anything reads or commits the
 * submodule whenever this run stops elsewhere: a conflict leaves the node it happened on checked
 * out mid-merge, as the main stack does, and any other failure goes back to home itself unless git
 * refuses the checkout.
 * @returns Every node of the chain with the head its remote now holds.
 * @throws {GitMergeConflictError} On a conflict, carrying the node's stack position and the
 * submodule's name.
 */
export async function refreshSubmoduleChain(params: RefreshSubmoduleChainParams): Promise<RefreshedSubmodulePr[]> {
    const { submodule, trunk, githubClient, githubConfig, logger } = params;

    const git = simpleGit({ baseDir: submodule.path, config: ['submodule.recurse=false'] });
    const subName = chalk.magenta(submodule.name);
    const home = assertValue(submodule.currentBranch, `${submodule.name} reached the chain refresh with no branch`);

    const chain = await resolveSubmodulePrChain({
        githubClient,
        githubConfig,
        submoduleName: submodule.name,
        branch: home,
        trunk,
    });
    const branches = chain.map(node => node.headRef);
    if (branches.length > 1) {
        logger.info(
            `   ${subName}: chain of ${chalk.bold(branches.length.toString())} PRs — ` +
                chain.map(node => `${chalk.cyan(node.headRef)} ${chalk.gray(`#${node.number}`)}`).join(' → '),
        );
    }

    await git.addConfig(REFRESH_HOME_KEY, home);
    await git.addConfig(REFRESH_PARENT_KEY, await getCurrentBranch());

    try {
        await syncStackNodesFromRemote({ branches, baseDir: submodule.path, logger });
        await mergeTrunkIntoBottom({ git, branches, trunk, repoDisplayName: subName, logger });
        await pushNodesAheadOfRemote({ git, branches, repoDisplayName: subName, logger });
        await cascadeStack({ branches, baseDir: submodule.path, logger });
    } catch (error) {
        if (!(error instanceof GitMergeConflictError)) {
            await returnHome(git, home);
            throw error;
        }

        throw new GitMergeConflictError({
            repoDisplayName: subName,
            conflictedFiles: error.conflictedFiles,
            operation: error.operation,
            stackContext: error.stackContext && { ...error.stackContext, submodule: submodule.name },
        });
    }

    await returnHome(git, home);

    if (branches.length > 1) {
        logger.info(
            `   ${chalk.green('✓')} ${subName}: chain up to date with ${chalk.cyan(trunk)}, back on ${chalk.cyan(home)}`,
        );
    }

    const refreshed: RefreshedSubmodulePr[] = [];
    for (const node of chain) {
        refreshed.push({
            submoduleName: submodule.name,
            githubConfig,
            number: node.number,
            headRef: node.headRef,
            headSha: (await git.revparse([`origin/${node.headRef}`])).trim(),
        });
    }

    return refreshed;
}

/**
 * Parameters for {@link restoreSubmoduleHomes}.
 */
export interface RestoreSubmoduleHomesParams {
    /**
     * Logger instance.
     */
    logger: Logger;
}

/**
 * Take every submodule an interrupted chain refresh left on another node back to the branch the
 * refresh started from, once the conflict is resolved and committed.
 *
 * This has to run before anything reads or commits a submodule: otherwise the main repository's
 * auto-commit records a gitlink pointing at the other node, and the readiness check judges that
 * node as the submodule's branch. It has to run before a task switch checks the submodules out,
 * too, while the main repository is still on the branch the refresh ran for.
 *
 * The record is dropped without moving anything when it no longer applies: when the main
 * repository is on another branch than the one the refresh ran for — a refresh abandoned there
 * says nothing about this branch's submodule — or when home no longer exists.
 * @throws {UsageError} When such a submodule is still mid-merge or dirty — the run has to stop here,
 * before the auto-commit, rather than commit a gitlink at the node the resolution is on.
 */
export async function restoreSubmoduleHomes(params: RestoreSubmoduleHomesParams): Promise<void> {
    const { logger } = params;

    for (const submodule of await getSubmoduleInfo()) {
        const git = simpleGit({ baseDir: submodule.path, config: ['submodule.recurse=false'] });
        const home = (await git.getConfig(REFRESH_HOME_KEY)).value;

        if (!home) {
            continue;
        }

        const subName = chalk.magenta(submodule.name);
        const refreshedFor = (await git.getConfig(REFRESH_PARENT_KEY)).value;
        const parentBranch = await getCurrentBranch();

        if (refreshedFor !== parentBranch) {
            logger.warn(
                `   ⚠️  ${subName}: dropping the interrupted refresh of ${chalk.cyan(refreshedFor ?? 'another branch')} — ` +
                    `this is ${chalk.cyan(parentBranch)}, so ${submodule.name} stays where it is`,
            );
            await clearRefreshRecord(git);
            continue;
        }

        if (!(await git.raw(['branch', '--list', home])).trim()) {
            logger.warn(
                `   ⚠️  ${subName}: ${chalk.cyan(home)}, where the interrupted refresh started, no longer exists — ` +
                    `${submodule.name} stays where it is`,
            );
            await clearRefreshRecord(git);
            continue;
        }

        if (submodule.hasChanges) {
            throw new UsageError(
                `${submodule.name} is still mid-refresh on ${submodule.currentBranch ?? 'a detached HEAD'} — ` +
                    `commit the conflict resolution there, then re-run.`,
            );
        }

        if (submodule.currentBranch !== home) {
            logger.info(`   ↩️  ${subName}: back on ${chalk.cyan(home)}, where the interrupted refresh started`);
        }

        await returnHome(git, home);
    }
}

/**
 * Check `home` out unless it already is, or unless the tree is mid-merge — the resolution belongs
 * where the conflict is, and git refuses to switch away from an unresolved index anyway — then clear
 * the record that the refresh left it.
 */
async function returnHome(git: SimpleGit, home: string): Promise<void> {
    const status = await git.status();
    if (status.conflicted.length > 0) {
        return;
    }

    if (status.current !== home) {
        await git.checkout(home);
    }

    await clearRefreshRecord(git);
}

/**
 * Drop the record a refresh keeps while it may leave the submodule away from home.
 */
async function clearRefreshRecord(git: SimpleGit): Promise<void> {
    for (const key of [REFRESH_HOME_KEY, REFRESH_PARENT_KEY]) {
        // `--unset` fails on a key that is not set, and a record may lack the parent branch.
        if ((await git.getConfig(key)).value !== null) {
            await git.raw(['config', '--local', '--unset', key]);
        }
    }
}

/**
 * Inputs shared by the steps of {@link refreshSubmoduleChain}.
 */
interface ChainStepParams {
    git: SimpleGit;
    branches: string[];
    repoDisplayName: string;
    logger: Logger;
}

/**
 * Inputs to {@link mergeTrunkIntoBottom}.
 */
interface MergeTrunkIntoBottomParams extends ChainStepParams {
    trunk: string;
}

/**
 * Merge `origin/<trunk>` into the chain's bottom node when it is behind. Pushing is left to
 * {@link pushNodesAheadOfRemote}.
 */
async function mergeTrunkIntoBottom(params: MergeTrunkIntoBottomParams): Promise<void> {
    const { git, branches, trunk, repoDisplayName, logger } = params;

    const bottom = assertValue(branches[0], 'the chain has no bottom node');
    const remoteTrunk = `origin/${trunk}`;
    const stackContext = { nodeBranch: bottom, nodePosition: 1, nodeCount: branches.length, against: trunk };

    await ensureLocalBranch(git, bottom);

    const behind = await countCommits(git, `${bottom}..${remoteTrunk}`);
    if (behind === 0) {
        logger.info(`   ${repoDisplayName}: ${chalk.cyan(bottom)} up to date with ${chalk.cyan(trunk)}`);
        return;
    }

    logger.info(
        `   ${repoDisplayName}: merging ${chalk.cyan(remoteTrunk)} into ${chalk.cyan(bottom)} ` +
            `(${chalk.yellow(behind.toString())} commit${behind === 1 ? '' : 's'} behind)...`,
    );

    if ((await git.status()).current !== bottom) {
        await git.checkout(bottom);
    }

    try {
        await git.merge([remoteTrunk]);
    } catch (error) {
        await rethrowWithStackPosition(
            () => handleMergeConflict({ git, repoDisplayName, operation: 'merge', logger }, error),
            stackContext,
        );
    }

    await rethrowWithStackPosition(
        () => assertNoConflicts({ git, repoDisplayName, operation: 'merge', logger }),
        stackContext,
    );

    logger.info(`   ${chalk.green('✓')} Merged ${chalk.cyan(trunk)} into ${chalk.cyan(bottom)}`);
}

/**
 * Push every node of the chain whose local branch is ahead of its remote, bottom first.
 *
 * Each push carries one node's own branch and never the node above's head: the node above is pushed
 * after it, by name, so GitHub never sees an upper node merged into the one below it.
 */
async function pushNodesAheadOfRemote(params: ChainStepParams): Promise<void> {
    const { git, branches, repoDisplayName, logger } = params;

    for (const branch of branches) {
        await ensureLocalBranch(git, branch);

        const ahead = await countCommits(git, `origin/${branch}..${branch}`);
        if (ahead === 0) {
            continue;
        }

        await git.push('origin', branch);
        logger.info(
            `   ${chalk.green('✓')} ${repoDisplayName}: pushed ${chalk.cyan(branch)} ` +
                `(${chalk.yellow(ahead.toString())} commit${ahead === 1 ? '' : 's'})`,
        );
    }
}
