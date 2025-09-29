import chalk from 'chalk';
import enquirer from 'enquirer';
import { simpleGit } from 'simple-git';

import type { Logger } from '@nzyme/logging';

import type { UnpushedCommitsResult } from './checkUnpushedCommits.js';
import type { GitStatusInfo } from './getGitStatusInfo.js';

/**
 * Handle the preparation phase before marking a PR as ready for review.
 * This includes prompting for pushing unpushed commits and committing uncommitted changes.
 */
export async function handleReadyPreparation(
    unpushedCommits: UnpushedCommitsResult,
    statusInfo: GitStatusInfo,
    logger: Logger,
): Promise<void> {
    const git = simpleGit();

    // Step 1: Handle unpushed commits
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

        const { shouldPush } = await enquirer.prompt<{ shouldPush: boolean }>({
            type: 'select',
            name: 'shouldPush',
            message: 'Do you want to push these commits before marking the PR as ready?',
            choices: [
                {
                    name: 'yes',
                    message: `Yes, push ${unpushedCommits.commitsCount} commit${
                        unpushedCommits.commitsCount === 1 ? '' : 's'
                    }`,
                    value: true,
                },
                {
                    name: 'no',
                    message: 'No, skip pushing',
                    value: false,
                },
            ],
        });

        if (shouldPush) {
            logger.info(
                `🚀 Pushing ${unpushedCommits.commitsCount} commit${unpushedCommits.commitsCount === 1 ? '' : 's'}...`,
            );
            await git.push();
            logger.info(`✅ Successfully pushed commits`);
        } else {
            logger.info(`⏭️  Skipping push - continuing with uncommitted changes check`);
        }
    }

    // Step 2: Handle uncommitted changes
    if (statusInfo.hasUncommittedChanges) {
        logger.info(
            `⚠️  You have ${chalk.yellow(statusInfo.totalChanges.toString())} uncommitted change${
                statusInfo.totalChanges === 1 ? '' : 's'
            }: ${chalk.yellow(statusInfo.changeDescription)}`,
        );

        const { shouldCommit } = await enquirer.prompt<{ shouldCommit: 'yes' | 'no' }>({
            type: 'select',
            name: 'shouldCommit',
            message: `Do you want to commit these ${statusInfo.totalChanges} change${
                statusInfo.totalChanges === 1 ? '' : 's'
            } before marking the PR as ready?`,
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
            // Add all changes to staging
            logger.info(`📦 Adding all changes to staging...`);
            await git.add('.');

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

            // Push the commit
            logger.info(`🚀 Pushing commit...`);
            await git.push();
            logger.info(`✅ Successfully committed and pushed changes`);
        } else {
            logger.info(`⏭️  Skipping commit - continuing with PR update`);
        }
    }

    if (!unpushedCommits.hasUnpushedCommits && !statusInfo.hasUncommittedChanges) {
        logger.info(`✅ Repository is clean - no commits to push or changes to commit`);
    }
}
