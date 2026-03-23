import chalk from 'chalk';
import type { SimpleGit } from 'simple-git';

import type { Logger } from '@nzyme/logging/Logger.js';

import { GitMergeConflictError } from './GitMergeConflictError.js';

const MAX_FILES_TO_SHOW = 10;

/**
 * Parameters for asserting no merge conflicts exist.
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
    const { git, repoDisplayName, logger } = params;

    const status = await git.status();
    const conflictedFiles = status.conflicted;

    if (conflictedFiles.length === 0) {
        return;
    }

    logger.error('');
    logger.error(chalk.red.bold(`   ✖ Merge conflict detected in ${repoDisplayName}`));
    logger.error('');
    logger.error(`   ${chalk.yellow('Conflicted files:')}`);

    const filesToShow = conflictedFiles.slice(0, MAX_FILES_TO_SHOW);

    for (const file of filesToShow) {
        logger.error(`     ${chalk.red('•')} ${file}`);
    }

    const remaining = conflictedFiles.length - MAX_FILES_TO_SHOW;
    if (remaining > 0) {
        logger.error(`     ${chalk.gray(`...and ${remaining} other file${remaining === 1 ? '' : 's'}`)}`);
    }

    logger.error('');
    logger.error(`   ${chalk.yellow('Please resolve the conflicts manually and try again.')}`);
    logger.error('');

    throw new GitMergeConflictError({
        repoDisplayName,
        conflictedFiles,
        operation: 'merge',
    });
}
