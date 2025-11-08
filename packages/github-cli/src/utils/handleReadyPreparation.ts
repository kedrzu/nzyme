import chalk from 'chalk';
import enquirer from 'enquirer';
import { simpleGit } from 'simple-git';

import type { Logger } from '@nzyme/logging';

import type { UnpushedCommitsResult } from './checkUnpushedCommits.js';
import type { GitStatusInfo } from './getGitStatusInfo.js';

/**
 * Handle the preparation phase before marking a PR as ready for review.
 * This includes committing uncommitted changes and pushing all commits.
 */
export async function handleReadyPreparation(
    unpushedCommits: UnpushedCommitsResult,
    statusInfo: GitStatusInfo,
    logger: Logger,
): Promise<void> {
    const git = simpleGit();
    let newCommitCreated = false;

    // Step 1: Show unpushed commits if any
    if (unpushedCommits.hasUnpushedCommits) {
        logger.info(
            `⚠️  You have ${chalk.yellow(unpushedCommits.commitsCount.toString())} unpushed commit${
                unpushedCommits.commitsCount === 1 ? '' : 's'
            }:`,
        );

        // Show the commit messages
        for (const message of unpushedCommits.commitMessages.slice(0, 5)) {
            logger.info(`   • ${chalk.gray(message)}`);
        }

        if (unpushedCommits.commitMessages.length > 5) {
            logger.info(`   ... and ${unpushedCommits.commitMessages.length - 5} more`);
        }
    }

    // Step 2: Handle uncommitted changes
    if (statusInfo.hasUncommittedChanges) {
        const hasStagedFiles = statusInfo.changes.staged > 0;
        const hasUnstagedFiles = statusInfo.totalChanges > statusInfo.changes.staged;

        logger.info(
            `⚠️  You have ${chalk.yellow(statusInfo.totalChanges.toString())} uncommitted change${
                statusInfo.totalChanges === 1 ? '' : 's'
            }: ${chalk.yellow(statusInfo.changeDescription)}`,
        );

        const { shouldCommit } = await enquirer.prompt<{ shouldCommit: 'no' | 'yes' }>({
            type: 'select',
            name: 'shouldCommit',
            message: `Do you want to commit these ${statusInfo.totalChanges} change${
                statusInfo.totalChanges === 1 ? '' : 's'
            }?`,
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

        if (shouldCommit === 'yes') {
            // Add unstaged changes to staging if there are any
            if (hasUnstagedFiles) {
                logger.info(`📦 Adding all changes to staging...`);
                await git.add('.');
            } else if (hasStagedFiles) {
                logger.info(`📦 Using already staged files...`);
            }

            // Prompt for commit message
            const { commitMessage } = await enquirer.prompt<{ commitMessage: string }>({
                type: 'input',
                name: 'commitMessage',
                message: 'Enter commit message:',
                initial: 'Ready for review',
                validate: (input: string) => {
                    if (!input.trim()) {
                        return 'Commit message cannot be empty';
                    }
                    return true;
                },
            });

            // Commit the changes
            logger.info(`💾 Committing changes with message: "${chalk.cyan(commitMessage)}"`);
            await git.commit(commitMessage.trim());
            newCommitCreated = true;
        } else {
            logger.info(`⏭️  Skipping commit`);
        }
    }

    // Step 3: Push all commits if there are any unpushed commits (existing or newly created)
    if (unpushedCommits.hasUnpushedCommits || newCommitCreated) {
        const totalCommitsToPush = unpushedCommits.commitsCount + (newCommitCreated ? 1 : 0);
        logger.info(
            `🚀 Pushing ${chalk.yellow(totalCommitsToPush.toString())} commit${totalCommitsToPush === 1 ? '' : 's'}...`,
        );
        await git.push();
        logger.info(`✅ Successfully pushed all commits`);
    } else if (!statusInfo.hasUncommittedChanges) {
        logger.info(`✅ Repository is clean - no commits to push or changes to commit`);
    }
}
