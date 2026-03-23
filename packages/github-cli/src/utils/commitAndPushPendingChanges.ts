import chalk from 'chalk';
import enquirer from 'enquirer';
import type { SimpleGit } from 'simple-git';
import { simpleGit } from 'simple-git';

import type { Logger } from '@nzyme/logging/Logger.js';

import { assertNoConflicts } from './assertNoConflicts.js';
import { checkUnpushedCommits } from './checkUnpushedCommits.js';
import { getGitStatusInfo } from './getGitStatusInfo.js';
import { pushWithUpstream } from './pushWithUpstream.js';

/**
 * Parameters for committing and pushing pending changes.
 */
export interface CommitAndPushPendingChangesParams {
    /**
     * Logger instance.
     */
    logger: Logger;

    /**
     * Optional SimpleGit instance (uses current directory if not provided).
     */
    git?: SimpleGit;

    /**
     * Optional repository display name (for logging).
     */
    repoDisplayName?: string;

    /**
     * Whether to skip prompts and automatically commit with default message.
     */
    autoYes?: boolean;

    /**
     * Default commit message.
     */
    defaultCommitMessage?: string;
}

/**
 * Result of committing and pushing pending changes.
 */
export interface CommitAndPushPendingChangesResult {
    /**
     * Whether a commit was created.
     */
    committed: boolean;

    /**
     * Whether changes were pushed.
     */
    pushed: boolean;

    /**
     * Whether there were uncommitted changes that were skipped.
     */
    skipped: boolean;
}

/**
 * Check for uncommitted changes and unpushed commits, prompt to commit and push them.
 * This should be called before merging to ensure working directory is clean.
 */
export async function commitAndPushPendingChanges(
    params: CommitAndPushPendingChangesParams,
): Promise<CommitAndPushPendingChangesResult> {
    const {
        logger,
        git = simpleGit(),
        repoDisplayName = 'repository',
        autoYes = false,
        defaultCommitMessage = 'Work in progress',
    } = params;

    // Check for uncommitted changes and unpushed commits
    const [unpushedCommits, statusInfo] = await Promise.all([checkUnpushedCommits(git), getGitStatusInfo(git)]);

    let committed = false;
    let pushed = false;
    let skipped = false;

    // Check for conflicts before committing
    if (statusInfo.changes.conflicted > 0) {
        await assertNoConflicts({ git, repoDisplayName, logger });
    }

    // Handle uncommitted changes
    if (statusInfo.hasUncommittedChanges) {
        logger.info(
            `   ⚠️  You have ${chalk.yellow(statusInfo.totalChanges.toString())} uncommitted change${
                statusInfo.totalChanges === 1 ? '' : 's'
            } in ${repoDisplayName}: ${chalk.yellow(statusInfo.changeDescription)}`,
        );

        let shouldCommit: 'no' | 'yes' = 'yes';
        let commitMessage = defaultCommitMessage;

        if (!autoYes) {
            const response = await enquirer.prompt<{ shouldCommit: 'no' | 'yes' }>({
                type: 'select',
                name: 'shouldCommit',
                message: `Do you want to commit these changes in ${repoDisplayName} before refreshing?`,
                choices: [
                    {
                        name: 'yes',
                        message: `Yes, commit ${statusInfo.totalChanges} change${statusInfo.totalChanges === 1 ? '' : 's'}`,
                    },
                    {
                        name: 'no',
                        message: 'No, skip committing (merge may fail if files conflict)',
                    },
                ],
            });
            shouldCommit = response.shouldCommit;

            if (shouldCommit === 'yes') {
                const msgResponse = await enquirer.prompt<{ commitMessage: string }>({
                    type: 'input',
                    name: 'commitMessage',
                    message: `Enter commit message for ${repoDisplayName}:`,
                    initial: defaultCommitMessage,
                    validate: (input: string) => {
                        if (!input.trim()) {
                            return 'Commit message cannot be empty';
                        }
                        return true;
                    },
                });
                commitMessage = msgResponse.commitMessage;
            }
        } else {
            logger.info(`   ✅ Auto-committing changes (--yes flag)`);
        }

        if (shouldCommit === 'yes') {
            // Stage all changes
            logger.info(`   📦 Staging all changes...`);
            await git.add('.');

            // Commit
            logger.info(`   💾 Committing with message: "${chalk.cyan(commitMessage)}"`);
            await git.commit(commitMessage.trim());
            committed = true;
        } else {
            logger.info(`   ⏭️  Skipping commit`);
            skipped = true;
        }
    }

    // Push if there are unpushed commits (existing or newly created)
    if (unpushedCommits.hasUnpushedCommits || committed) {
        const totalCommitsToPush = unpushedCommits.commitsCount + (committed ? 1 : 0);

        if (unpushedCommits.hasUnpushedCommits && !committed) {
            logger.info(
                `   ⚠️  You have ${chalk.yellow(totalCommitsToPush.toString())} unpushed commit${
                    totalCommitsToPush === 1 ? '' : 's'
                } in ${repoDisplayName}`,
            );
        }

        logger.info(
            `   🚀 Pushing ${chalk.yellow(totalCommitsToPush.toString())} commit${totalCommitsToPush === 1 ? '' : 's'}...`,
        );

        // Push (handles case where no upstream is configured)
        await pushWithUpstream(git);

        logger.info(`   ✅ Pushed successfully`);
        pushed = true;
    }

    return { committed, pushed, skipped };
}
