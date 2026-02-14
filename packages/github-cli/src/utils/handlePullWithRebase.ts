import chalk from 'chalk';
import enquirer from 'enquirer';
import type { SimpleGit } from 'simple-git';

import type { Logger } from '@nzyme/logging/Logger.js';

/**
 * Parameters for handling pull with rebase.
 */
export interface HandlePullWithRebaseParams {
    /**
     * Simple-git instance.
     */
    git: SimpleGit;

    /**
     * Remote name (e.g., 'origin').
     */
    remote: string;

    /**
     * Branch name to pull.
     */
    branch: string;

    /**
     * Logger instance.
     */
    logger: Logger;

    /**
     * Context message for user-friendly error display (e.g., 'repository' or 'submodule nzyme').
     */
    contextMessage?: string;
}

/**
 * Result of pull operation.
 */
export interface PullResult {
    /**
     * Whether the pull succeeded.
     */
    success: boolean;

    /**
     * Whether rebase was used.
     */
    usedRebase: boolean;

    /**
     * Whether the user cancelled the operation.
     */
    cancelled: boolean;
}

/**
 * Attempt to pull from remote, offering rebase option if pull fails due to divergent branches.
 */
export async function handlePullWithRebase(params: HandlePullWithRebaseParams): Promise<PullResult> {
    const { git, remote, branch, logger, contextMessage = 'repository' } = params;

    try {
        // Attempt normal pull
        await git.pull(remote, branch);
        return { success: true, usedRebase: false, cancelled: false };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Check if this is a divergent branch error
        if (!isDivergentBranchError(errorMessage)) {
            // Not a divergent branch error - return failure without prompting
            // This could be because the branch doesn't exist on remote (which is fine for new branches)
            // or due to other errors like network issues
            return { success: false, usedRebase: false, cancelled: false };
        }

        // Display user-friendly message
        logger.info('');
        logger.warn(`⚠️  Cannot pull branch ${chalk.cyan(branch)}: your local branch has diverged from ${remote}`);
        logger.info(`💡 Your local branch and the remote branch have different commits`);
        logger.info('');

        // Prompt user for action
        const action = await promptForRebase(branch, contextMessage);

        if (action === 'cancel') {
            return { success: false, usedRebase: false, cancelled: true };
        }

        // User chose to rebase - attempt pull with rebase
        try {
            logger.info(`🔄 Pulling ${chalk.cyan(branch)} from ${remote} with rebase...`);
            await git.pull(remote, branch, { '--rebase': 'true' });
            logger.info(`✅ Successfully pulled ${chalk.cyan(branch)} with rebase`);
            return { success: true, usedRebase: true, cancelled: false };
        } catch (rebaseError) {
            const rebaseErrorMessage = rebaseError instanceof Error ? rebaseError.message : String(rebaseError);
            logger.error(`❌ Failed to rebase: ${rebaseErrorMessage}`);
            logger.info(`💡 You may need to resolve conflicts manually with:`);
            logger.info(`   ${chalk.gray('git rebase --abort')} to cancel the rebase`);
            logger.info(`   ${chalk.gray('git rebase --continue')} after resolving conflicts`);
            throw rebaseError;
        }
    }
}

/**
 * Check if a git error indicates divergent branches that could be resolved with rebase.
 */
function isDivergentBranchError(errorMessage: string): boolean {
    const divergentPatterns = [
        'divergent branches',
        'not possible to fast-forward',
        'refusing to merge unrelated histories',
        'have diverged',
        'fatal: need to specify how to reconcile divergent branches',
    ];

    const lowerMessage = errorMessage.toLowerCase();
    return divergentPatterns.some(pattern => lowerMessage.includes(pattern));
}

/**
 * Prompt user whether to pull with rebase or cancel.
 */
async function promptForRebase(branch: string, contextMessage: string): Promise<'cancel' | 'rebase'> {
    const { action } = await enquirer.prompt<{ action: 'cancel' | 'rebase' }>({
        type: 'select',
        name: 'action',
        message: `What do you want to do for ${chalk.cyan(branch)} in ${contextMessage}?`,
        choices: [
            {
                name: 'rebase',
                message: `${chalk.green('Pull with rebase')} - Reapply your local commits on top of remote changes`,
                value: 'rebase' as const,
            },
            {
                name: 'cancel',
                message: `${chalk.red('Cancel')} - I'll handle this manually`,
                value: 'cancel' as const,
            },
        ],
        initial: 0,
    });

    return action;
}
