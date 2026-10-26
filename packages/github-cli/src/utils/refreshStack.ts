import chalk from 'chalk';
import { simpleGit } from 'simple-git';

import type { Logger } from '@nzyme/logging/Logger.js';

import { autoCommitChanges } from './autoCommitChanges.js';
import { cascadeStack } from './cascadeStack.js';
import type { GithubConfig } from '../GithubConfig.js';
import type { GithubClient } from './createGithubClient.js';
import { GitMergeConflictError } from './GitMergeConflictError.js';
import { getSubmoduleInfo } from './getSubmoduleInfo.js';
import { restoreSubmoduleHomes } from './refreshSubmoduleChain.js';
import type { SubmoduleBase } from './resolveSubmoduleBase.js';
import type { SyncAllReposResult } from './syncAllRepos.js';
import { syncAllRepos } from './syncAllRepos.js';
import { syncStackNodesFromRemote } from './syncStackNodesFromRemote.js';

/**
 * Parameters for {@link refreshStack}.
 */
export interface RefreshStackParams {
    /**
     * Node branches ordered bottom to top.
     */
    branches: string[];

    /**
     * Branch the whole stack ultimately lands on (e.g. `main`).
     */
    trunk: string;

    /**
     * What the submodules follow, forwarded to `syncAllRepos` — see `resolveSubmoduleBase`.
     * Distinct from {@link trunk}, which is the main repository's merge source.
     */
    submoduleBase: SubmoduleBase;

    /**
     * Whether nobody can be asked a question — see `decideUnattendedMode`.
     */
    unattended: boolean;

    /**
     * GitHub client used while judging each submodule's readiness.
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
 * Bring a whole stack up to date with the trunk, from whichever node you happen to be standing on.
 *
 * The trunk touches a stack in exactly one place — the bottom node — so that is the only node the
 * trunk is merged into, and everything above it gets the change second-hand via the cascade. Doing
 * it any other way is what poisons the diffs: merging the trunk straight into an upper node makes
 * the trunk's commits show up as that node's own work, because a pull request's diff is measured
 * against the node below it.
 *
 * You end up back on the node you started from — refreshing is a maintenance step, not a navigation
 * one.
 * @returns What the trunk sync of the bottom node did, including the submodule pull requests it
 * refreshed.
 */
export async function refreshStack(params: RefreshStackParams): Promise<SyncAllReposResult> {
    const { branches, trunk, submoduleBase, unattended, githubClient, githubConfig, logger } = params;

    const bottomBranch = branches[0]!;
    const git = simpleGit({ config: ['submodule.recurse=false'] });
    const startingBranch = (await git.status()).current;

    logger.info('');
    logger.info(
        `🧱 Refreshing a stack of ${chalk.bold(branches.length.toString())} nodes against ${chalk.cyan(trunk)}`,
    );

    // Commit before anything touches history, not after. Two steps below are hostile to an
    // uncommitted working tree: the remote sync hard-resets the checked-out node when the server
    // rewrote it, and dropping to the bottom node would carry the changes onto a node they were not
    // written for. `syncAllRepos` auto-commits too, but only once both have already happened — far
    // too late. Committing here lands the work on the node it belongs to and leaves that later
    // auto-commit with nothing to do. A pinned submodule's gitlink is left out, as there. A submodule
    // an interrupted refresh left on a lower node of its own chain goes home first, or this commit
    // would record a gitlink pointing at that node.
    if (submoduleBase.kind === 'trunk') {
        await restoreSubmoduleHomes({ logger });
    }

    await autoCommitChanges({
        logger,
        git,
        repoDisplayName: startingBranch ?? 'main repository',
        excludedPaths: submoduleBase.kind === 'pin' ? (await getSubmoduleInfo()).map(sub => sub.path) : [],
    });

    // The stack's branches may have been rewritten on the server — by a lower node merging, or by a
    // "Rebase stack". Adopt those rewrites first, or the sync below replays superseded commits.
    await syncStackNodesFromRemote({ branches, logger });

    try {
        if (startingBranch !== bottomBranch) {
            logger.info(`↩️  Dropping to the bottom node ${chalk.cyan(bottomBranch)} to take in ${chalk.cyan(trunk)}`);
            await git.checkout(bottomBranch);
        }

        let syncResult: SyncAllReposResult;
        try {
            syncResult = await syncAllRepos({
                branch: bottomBranch,
                baseBranch: trunk,
                submoduleBase,
                unattended,
                githubClient,
                githubConfig,
                logger,
            });
        } catch (error) {
            throw withStackPosition(error, {
                nodeBranch: bottomBranch,
                nodePosition: 1,
                nodeCount: branches.length,
                against: trunk,
            });
        }

        await cascadeStack({ branches, logger });

        return syncResult;
    } finally {
        // Return to where the user was — unless a conflict left the working tree mid-merge, where
        // switching away would strand the resolution they are about to make.
        const current = (await git.status()).current;
        const conflicted = (await git.status()).conflicted.length > 0;

        if (startingBranch && current !== startingBranch && !conflicted) {
            await git.checkout(startingBranch);
        }
    }
}

/**
 * Attach the stack position to a conflict raised by the trunk sync, which knows about repositories
 * but not about nodes.
 */
function withStackPosition(error: unknown, stackContext: NonNullable<GitMergeConflictError['stackContext']>): unknown {
    if (error instanceof GitMergeConflictError && !error.stackContext) {
        return new GitMergeConflictError({
            repoDisplayName: error.repoDisplayName,
            conflictedFiles: error.conflictedFiles,
            operation: error.operation,
            stackContext,
        });
    }

    return error;
}

/**
 * Explain a stack conflict where it happened and what to do next.
 *
 * Three things the plain conflict report cannot say, and all three change what the reader does: the
 * node the fix belongs to, that moving the fix to a node above would bury the trunk's changes inside
 * someone else's layer, and that the rest of the chain is still waiting — re-running the refresh
 * finishes it, because nodes already up to date are skipped.
 */
export function logStackConflictGuidance(error: GitMergeConflictError, logger: Logger): void {
    const context = error.stackContext;
    if (!context) {
        return;
    }

    const { nodeBranch, nodePosition, nodeCount, against, submodule } = context;
    const where = submodule ? `${chalk.magenta(submodule)}'s chain node` : 'stack node';

    logger.error('');
    logger.error(
        chalk.red.bold(
            `   ✖ Conflict on ${where} ${nodePosition}/${nodeCount} — ${chalk.cyan(nodeBranch)} vs ${chalk.cyan(against)}`,
        ),
    );
    logger.error('');
    logger.error(
        `   ${chalk.yellow('Resolve it on this node.')} It is checked out and mid-merge${submodule ? ` in ${chalk.magenta(submodule)}` : ''}.`,
    );
    logger.error(
        `   ${chalk.gray('Resolving it on a node above instead would bury')} ${chalk.cyan(against)}${chalk.gray("'s changes inside that node's own diff.")}`,
    );

    if (nodePosition < nodeCount) {
        logger.error('');
        logger.error(
            `   ${chalk.gray(`${nodeCount - nodePosition} node(s) above are still waiting. Commit the resolution, then re-run`)} ${chalk.cyan('task refresh')} ${chalk.gray('— it picks up where it stopped.')}`,
        );
    }

    if (submodule) {
        logger.error('');
        logger.error(
            `   ${chalk.gray(`Commit the resolution in ${submodule} (do not switch branches there); the re-run takes ${submodule} back to the branch the refresh started from.`)}`,
        );
    }

    logger.error('');
}
