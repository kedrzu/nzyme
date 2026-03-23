import chalk from 'chalk';
import type { SimpleGit } from 'simple-git';

import type { Logger } from '@nzyme/logging/Logger.js';

import { GitMergeConflictError } from './GitMergeConflictError.js';
import { logConflictedFiles } from './logConflictedFiles.js';

/**
 * Parameters for asserting no merge or rebase conflicts exist.
 */
export interface AssertNoConflictsParams {
    /**
     * The git instance for the repository.
     */
    git: SimpleGit;

    /**
     * Display name of the repository.
     */
    repoDisplayName: string;

    /**
     * The operation that may have caused conflicts ('merge' or 'rebase').
     */
    operation: 'merge' | 'rebase';

    /**
     * Logger instance.
     */
    logger: Logger;
}

/**
 * Assert that the working tree has no merge conflicts.
 * Throws GitMergeConflictError if any conflicted files are found.
 *
 * Unlike handleMergeConflict (which operates inside catch blocks and aborts operations),
 * this is a proactive check used to verify state before committing or pushing.
 */
export async function assertNoConflicts(params: AssertNoConflictsParams): Promise<void> {
    const { git, repoDisplayName, operation, logger } = params;

    const status = await git.status();
    const conflictedFiles = status.conflicted;

    if (conflictedFiles.length === 0) {
        return;
    }

    const operationLabel = operation === 'rebase' ? 'Rebase' : 'Merge';

    logger.error('');
    logger.error(chalk.red.bold(`   ✖ ${operationLabel} conflict detected in ${repoDisplayName}`));
    logger.error('');

    logConflictedFiles({ conflictedFiles, logger });

    logger.error('');
    logger.error(`   ${chalk.yellow('Please resolve the conflicts manually and try again.')}`);
    logger.error('');

    throw new GitMergeConflictError({
        repoDisplayName,
        conflictedFiles,
        operation,
    });
}
