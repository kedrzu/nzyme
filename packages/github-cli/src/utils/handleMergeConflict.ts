import chalk from 'chalk';
import type { SimpleGit } from 'simple-git';

import type { Logger } from '@nzyme/logging/Logger.js';

import { GitMergeConflictError } from './GitMergeConflictError.js';
import { logConflictedFiles } from './logConflictedFiles.js';

/**
 * Parameters for handling a merge conflict.
 */
interface HandleMergeConflictParams {
    /**
     * The git instance for the repository.
     */
    git: SimpleGit;

    /**
     * Display name of the repository.
     */
    repoDisplayName: string;

    /**
     * The operation that failed ('merge' or 'rebase').
     */
    operation: 'merge' | 'rebase';

    /**
     * Logger instance.
     */
    logger: Logger;
}

/**
 * Handle a merge or rebase conflict by detecting conflicted files,
 * logging a formatted error, aborting the operation, and throwing.
 *
 * Should be called in a catch block after a merge/rebase operation fails.
 * If the error is not a conflict, the original error is re-thrown as-is.
 */
export async function handleMergeConflict(params: HandleMergeConflictParams, error: unknown): Promise<never> {
    const { git, repoDisplayName, operation, logger } = params;

    // Check if there are actually conflicted files
    const status = await git.status();
    const conflictedFiles = status.conflicted;

    if (conflictedFiles.length === 0) {
        // Not a conflict - re-throw original error
        throw error;
    }

    // Log formatted conflict error
    logger.error('');
    logger.error(chalk.red.bold(`   ✖ ${operation === 'rebase' ? 'Rebase' : 'Merge'} conflict in ${repoDisplayName}`));
    logger.error('');

    logConflictedFiles({ conflictedFiles, logger });

    logger.error('');

    // Abort the failed operation
    try {
        if (operation === 'rebase') {
            await git.rebase(['--abort']);
        } else {
            await git.merge(['--abort']);
        }
        logger.info(`   ${chalk.gray(`${operation === 'rebase' ? 'Rebase' : 'Merge'} aborted.`)}`);
    } catch {
        // Abort may fail if git is in a weird state - ignore
    }

    logger.error(`   ${chalk.yellow('Please resolve the conflicts manually and try again.')}`);
    logger.error('');

    throw new GitMergeConflictError({
        repoDisplayName,
        conflictedFiles,
        operation,
    });
}
