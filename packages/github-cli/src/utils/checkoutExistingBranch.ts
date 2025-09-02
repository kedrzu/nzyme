import chalk from 'chalk';
import enquirer from 'enquirer';
import { simpleGit } from 'simple-git';

import type { Logger } from '@nzyme/logging';

import { checkoutBranch } from './checkoutBranch.js';

/**
 * Checkout an existing branch, handling uncommitted changes by prompting the user.
 */
export async function checkoutExistingBranch(branchName: string, taskId: string, logger: Logger): Promise<void> {
    const git = simpleGit();

    try {
        // Check if there are uncommitted changes
        const status = await git.status();
        const hasChanges = status.files.length > 0;

        if (!hasChanges) {
            // No uncommitted changes, checkout normally
            await checkoutBranch(branchName);
            return;
        }

        // Show what changes exist
        const changeTypes: string[] = [];
        if (status.modified.length > 0) {
            changeTypes.push(`${status.modified.length} modified`);
        }
        if (status.staged.length > 0) {
            changeTypes.push(`${status.staged.length} staged`);
        }
        if (status.not_added.length > 0) {
            changeTypes.push(`${status.not_added.length} untracked`);
        }
        if (status.deleted.length > 0) {
            changeTypes.push(`${status.deleted.length} deleted`);
        }
        if (status.created.length > 0) {
            changeTypes.push(`${status.created.length} created`);
        }
        if (status.renamed.length > 0) {
            changeTypes.push(`${status.renamed.length} renamed`);
        }

        logger.info(`⚠️  You have uncommitted changes: ${chalk.yellow(changeTypes.join(', '))}`);

        // Ask user what to do with uncommitted changes
        const { action } = await enquirer.prompt<{ action: string }>({
            type: 'select',
            name: 'action',
            message: `How do you want to handle uncommitted changes when switching to ${chalk.cyan(branchName)}?`,
            choices: [
                {
                    name: 'stash',
                    message: `${chalk.green('Stash changes')} and reapply them after checkout`,
                    value: 'stash',
                },
                {
                    name: 'checkout',
                    message: `${chalk.yellow('Try to checkout as is')} (may fail if there are conflicts)`,
                    value: 'checkout',
                },
                {
                    name: 'cancel',
                    message: `${chalk.red('Cancel')} - I'll handle the changes manually`,
                    value: 'cancel',
                },
            ],
        });

        switch (action) {
            case 'checkout': {
                // Try to checkout directly - git will handle conflicts
                logger.info(`🔄 Attempting to checkout ${chalk.cyan(branchName)} with uncommitted changes...`);
                await checkoutBranch(branchName);
                logger.info(`✅ Successfully checked out ${chalk.cyan(branchName)} with uncommitted changes`);
                break;
            }

            case 'stash': {
                // Stash changes, checkout, then reapply
                const stashName = `task-${taskId}-existing-branch-stash`;
                logger.info(`📦 Stashing uncommitted changes as: ${chalk.cyan(stashName)}`);

                await git.stash(['push', '-u', '-m', stashName]);
                logger.info(`✅ Changes stashed successfully`);

                // Checkout the branch
                await checkoutBranch(branchName);

                // Try to reapply the stash
                try {
                    logger.info(`📦 Reapplying stashed changes: ${chalk.cyan(stashName)}`);
                    const stashes = await git.stashList();
                    const targetStashIndex = stashes.all.findIndex(stash => stash.message.includes(stashName));

                    if (targetStashIndex !== -1) {
                        await git.stash(['pop', `stash@{${targetStashIndex}}`]);
                        logger.info(`✅ Stashed changes reapplied successfully`);
                    } else {
                        logger.warn(`⚠️  Could not find stash: ${chalk.cyan(stashName)}`);
                        logger.info(
                            `💡 You can manually apply it later with: git stash list && git stash apply stash@{N}`,
                        );
                    }
                } catch (error) {
                    logger.error(`❌ Failed to reapply stash ${chalk.cyan(stashName)}: ${(error as Error).message}`);
                    logger.info(`💡 You can manually apply it later with: git stash list && git stash apply stash@{N}`);
                }
                break;
            }

            case 'cancel': {
                throw new Error('Operation cancelled by user. Please handle your uncommitted changes and try again.');
            }

            default: {
                throw new Error(`Unknown action: ${action}`);
            }
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`Failed to checkout branch ${branchName}: ${errorMessage}`);
    }
}
