import chalk from 'chalk';
import type { SimpleGit } from 'simple-git';
import { simpleGit } from 'simple-git';

import type { Logger } from '@nzyme/logging/Logger.js';
import { assertValue } from '@nzyme/utils/assert.js';

import type { GithubConfig } from '../GithubConfig.js';
import { assertNoConflicts } from './assertNoConflicts.js';
import { assertOnBranch } from './assertOnBranch.js';
import { assertPushLeavesUpperNodesOpen } from './assertPushLeavesUpperNodesOpen.js';
import { cascadeStack } from './cascadeStack.js';
import { countCommits } from './countCommits.js';
import type { GithubClient } from './createGithubClient.js';
import { ensureLocalBranch } from './ensureLocalBranch.js';
import { GitMergeConflictError } from './GitMergeConflictError.js';
import type { SubmoduleInfo } from './getSubmoduleInfo.js';
import { handleMergeConflict } from './handleMergeConflict.js';
import { resolveSubmodulePrChain } from './resolveSubmodulePrChain.js';
import { rethrowWithStackPosition } from './rethrowWithStackPosition.js';
import { syncStackNodesFromRemote } from './syncStackNodesFromRemote.js';

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
 * home's refreshed head — on a conflict too, when every node below the conflicted one is pushed and
 * home is either among them or untouched. After any other failure home may hold commits its remote
 * lacks, so the gitlink is left for the re-run. A conflict is aborted rather than left mid-merge on the
 * node it happened on: that node is not home, and a gitlink committed while the submodule sits there
 * would point the main repository at it. The conflict is resolved by hand on that node and the
 * refresh re-run from home.
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

        await git.merge(['--abort']);
        await returnHome(git, home);

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
 * Check `home` out unless it already is.
 */
async function returnHome(git: SimpleGit, home: string): Promise<void> {
    if ((await git.status()).current !== home) {
        await git.checkout(home);
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
    await assertOnBranch(git, bottom);

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
 * Each push carries one node's own branch and never the node above's head — refused, if a merge by
 * hand put it there — so GitHub never sees an upper node merged into the one below it.
 */
async function pushNodesAheadOfRemote(params: ChainStepParams): Promise<void> {
    const { git, branches, repoDisplayName, logger } = params;

    for (const [index, branch] of branches.entries()) {
        await ensureLocalBranch(git, branch);

        const ahead = await countCommits(git, `origin/${branch}..${branch}`);
        if (ahead === 0) {
            continue;
        }

        // The branch is pushed by name, not checked out, so only the push half of the stack guard
        // applies. A node resolved by hand is exactly where a merge in the wrong direction happens.
        const upperBranch = branches[index + 1];
        await assertPushLeavesUpperNodesOpen({
            git,
            branch,
            upperNodes: upperBranch ? [{ branch: upperBranch, head: `origin/${upperBranch}` }] : [],
        });
        await git.push('origin', branch);
        logger.info(
            `   ${chalk.green('✓')} ${repoDisplayName}: pushed ${chalk.cyan(branch)} ` +
                `(${chalk.yellow(ahead.toString())} commit${ahead === 1 ? '' : 's'})`,
        );
    }
}
