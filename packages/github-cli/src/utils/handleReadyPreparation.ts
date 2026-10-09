import chalk from 'chalk';
import { simpleGit } from 'simple-git';

import type { Logger } from '@nzyme/logging/Logger.js';

import { assertNoConflicts } from './assertNoConflicts.js';
import type { UnpushedCommitsResult } from './checkUnpushedCommits.js';
import type { BranchGuard } from './createBranchGuard.js';
import { describeChangedPaths } from './describeChangedPaths.js';
import type { GitStatusInfo } from './getGitStatusInfo.js';
import { pushWithUpstream } from './pushWithUpstream.js';

/**
 * Parameters for {@link handleReadyPreparation}.
 */
export interface HandleReadyPreparationParams {
    /**
     * Commits on the current branch not yet on its remote.
     */
    unpushedCommits: UnpushedCommitsResult;

    /**
     * Working-tree status of the main repository.
     */
    statusInfo: GitStatusInfo;

    /**
     * Logger instance.
     */
    logger: Logger;

    /**
     * Why the changes are being committed (e.g. "Ready for review").
     * @default 'Ready for review'
     */
    defaultCommitMessage?: string;

    /**
     * Guard of the branch being pushed, checked right before the commit and the push: by now the
     * command has spent a while on GitHub calls and prompts, long enough for another command in the
     * same worktree to check out a different node.
     */
    guard: BranchGuard;
}

/**
 * Handle the preparation phase before marking a PR as ready for review.
 * This includes committing uncommitted changes and pushing all commits.
 *
 * The commit message is always generated, never asked for: `defaultCommitMessage` names *why*
 * (e.g. "Ready for review"), and `describeChangedPaths` names *what* changed. When both are
 * available they are combined ("Fixes after review: packages/cli/src/git"); with nothing to
 * describe, `defaultCommitMessage` is used on its own.
 */
export async function handleReadyPreparation(params: HandleReadyPreparationParams): Promise<void> {
    const { unpushedCommits, statusInfo, logger, defaultCommitMessage = 'Ready for review', guard } = params;
    const git = simpleGit();
    let newCommitCreated = false;

    // Step 1: Show unpushed commits if any
    if (unpushedCommits.hasUnpushedCommits) {
        logger.info(
            `   ${chalk.yellow(unpushedCommits.commitsCount.toString())} unpushed commit${
                unpushedCommits.commitsCount === 1 ? '' : 's'
            }:`,
        );

        for (const message of unpushedCommits.commitMessages.slice(0, 5)) {
            logger.info(`      • ${chalk.gray(message)}`);
        }

        if (unpushedCommits.commitMessages.length > 5) {
            logger.info(`      ... and ${unpushedCommits.commitMessages.length - 5} more`);
        }
    }

    // Step 2: Check for conflicts before committing
    if (statusInfo.changes.conflicted > 0) {
        await assertNoConflicts({ git, repoDisplayName: 'main repository', operation: 'merge', logger });
    }

    // Step 3: Handle uncommitted changes
    if (statusInfo.hasUncommittedChanges) {
        const hasStagedFiles = statusInfo.changes.staged > 0;
        const hasUnstagedFiles = statusInfo.totalChanges > statusInfo.changes.staged;

        logger.info(
            `   ${chalk.yellow(statusInfo.totalChanges.toString())} uncommitted change${
                statusInfo.totalChanges === 1 ? '' : 's'
            }: ${chalk.yellow(statusInfo.changeDescription)}`,
        );

        const description = describeChangedPaths(statusInfo.changedPaths);
        const commitMessage = description ? `${defaultCommitMessage}: ${description}` : defaultCommitMessage;

        // Add unstaged changes to staging if there are any
        if (hasUnstagedFiles) {
            await git.add('.');
        } else if (hasStagedFiles) {
            // Using already staged files
        }

        // Commit the changes
        logger.info(`   Committing: "${chalk.cyan(commitMessage)}"`);
        await guard.beforeWrite();
        await git.commit(commitMessage.trim());
        newCommitCreated = true;
    }

    // Step 3: Push all commits if there are any unpushed commits (existing or newly created)
    if (unpushedCommits.hasUnpushedCommits || newCommitCreated) {
        const totalCommitsToPush = unpushedCommits.commitsCount + (newCommitCreated ? 1 : 0);
        logger.info(
            `   Pushing ${chalk.yellow(totalCommitsToPush.toString())} commit${totalCommitsToPush === 1 ? '' : 's'}...`,
        );
        await guard.beforePush();
        await pushWithUpstream(git);
        logger.info(`   ${chalk.green('✓')} Pushed successfully`);
    } else if (!statusInfo.hasUncommittedChanges) {
        logger.info(`   Already up to date`);
    }
}
