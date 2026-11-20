import chalk from 'chalk';
import enquirer from 'enquirer';
import { simpleGit } from 'simple-git';

import { UsageError } from '@nzyme/cli-core';
import type { Logger } from '@nzyme/logging/Logger.js';

import type { GithubConfig } from '../GithubConfig.js';
import { checkoutBranch } from './checkoutBranch.js';
import { checkoutSubmodules } from './checkoutSubmodules.js';
import type { GithubClient } from './createGithubClient.js';
import { decideDirtyCheckout } from './decideDirtyCheckout.js';
import { applyNamedStash, pushNamedStash } from './namedStash.js';
import type { SubmoduleBase } from './resolveSubmoduleBase.js';

/**
 * Parameters for checking out an existing branch.
 */
export interface CheckoutExistingBranchParams {
    /**
     * The branch name to checkout.
     */
    branchName: string;

    /**
     * The task ID (e.g., "ABC-123").
     */
    taskId: string;

    /**
     * Logger instance.
     */
    logger: Logger;

    /**
     * GitHub client instance. Together with {@link githubConfig} and {@link submoduleBase} it turns
     * on the submodule step - see `checkoutSubmodules`. Omit all three to check out the main
     * repository alone, when the caller runs that step itself.
     */
    githubClient?: GithubClient;

    /**
     * GitHub configuration - see {@link githubClient}.
     */
    githubConfig?: GithubConfig;

    /**
     * What the submodules follow - see `CheckoutSubmodulesParams.submoduleBase` and
     * {@link githubClient}.
     */
    submoduleBase?: SubmoduleBase;

    /**
     * Whether nobody is available to answer a question.
     * Uncommitted changes are then kept in place when the working tree is already on
     * {@link branchName}, and the checkout is refused otherwise - see {@link decideDirtyCheckout}.
     * A submodule that is not safe to move is likewise refused with a `UsageError` rather than
     * moved - see `checkoutSubmodules`.
     */
    unattended?: boolean;
}

/**
 * Checkout an existing branch, handling uncommitted changes by prompting the user.
 * Also handles checking out matching branches in submodules if GitHub client is provided.
 */
export async function checkoutExistingBranch(params: CheckoutExistingBranchParams): Promise<void> {
    const { branchName, logger: paramLogger, unattended } = params;
    const git = simpleGit();

    try {
        // Check if there are uncommitted changes
        const status = await git.status();
        const hasChanges = status.files.length > 0;

        if (!hasChanges) {
            // No uncommitted changes, checkout normally
            await checkoutBranch(branchName, paramLogger, unattended);
            await checkoutBranchSubmodules(params);
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

        paramLogger.info(`⚠️  You have uncommitted changes: ${chalk.yellow(changeTypes.join(', '))}`);

        // `status` already knows which branch we are on, so deciding this costs no extra git call.
        const decision = decideDirtyCheckout({
            currentBranch: status.current,
            targetBranch: branchName,
            interactive: process.stdin.isTTY,
            unattended,
        });

        if (decision === 'refuse') {
            throw new UsageError(
                `Refusing to switch from ${status.current ?? 'a detached HEAD'} to ${branchName} with uncommitted ` +
                    `changes, because doing so can carry them onto ${branchName} unnoticed. ` +
                    `Commit or discard them first.`,
            );
        }

        if (decision === 'proceed') {
            paramLogger.info(`✅ Already on ${chalk.cyan(branchName)} - keeping the uncommitted changes in place`);
            await checkoutBranch(branchName, paramLogger, unattended);
            await checkoutBranchSubmodules(params);
            return;
        }

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
                paramLogger.info(`🔄 Attempting to checkout ${chalk.cyan(branchName)} with uncommitted changes...`);
                await checkoutBranch(branchName, paramLogger, unattended);
                paramLogger.info(`✅ Successfully checked out ${chalk.cyan(branchName)} with uncommitted changes`);
                await checkoutBranchSubmodules(params);
                break;
            }

            case 'stash': {
                // Stash changes, checkout, then reapply.
                const stash = await pushNamedStash(git, `task-${params.taskId}-existing-branch`, paramLogger);

                // Checkout the branch
                await checkoutBranch(branchName, paramLogger, unattended);

                // Checkout submodules before reapplying stash
                await checkoutBranchSubmodules(params);

                // Absent when the entry could not be re-identified after the push - then it stays on
                // the shared stack, because applying something we cannot name unambiguously is the
                // one thing that stack makes unsafe. `pushNamedStash` already said how to recover it.
                if (stash) {
                    await applyNamedStash(git, stash, paramLogger);
                }

                break;
            }

            case 'cancel': {
                throw new UsageError(
                    'Operation canceled by user. Please handle your uncommitted changes and try again.',
                );
            }

            default: {
                throw new UsageError(`Unknown action: ${action}`);
            }
        }
    } catch (error) {
        if (error instanceof UsageError) {
            // Already says what went wrong and what resolves it - wrapping it would bury that.
            throw error;
        }

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new UsageError(`Failed to checkout branch ${branchName}: ${errorMessage}`);
    }
}

/**
 * Run the submodule step when the caller asked for it - see `CheckoutExistingBranchParams.githubClient`.
 */
async function checkoutBranchSubmodules(params: CheckoutExistingBranchParams): Promise<void> {
    const { githubClient, githubConfig, submoduleBase, logger, unattended } = params;

    if (!githubClient || !githubConfig || !submoduleBase) {
        return;
    }

    await checkoutSubmodules({ githubClient, githubConfig, submoduleBase, logger, unattended });
}
