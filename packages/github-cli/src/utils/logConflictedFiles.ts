import chalk from 'chalk';

import type { Logger } from '@nzyme/logging/Logger.js';

const MAX_FILES_TO_SHOW = 10;

/**
 * Parameters for logging conflicted files.
 */
export interface LogConflictedFilesParams {
    /**
     * List of conflicted file paths.
     */
    conflictedFiles: string[];

    /**
     * Logger instance.
     */
    logger: Logger;
}

/**
 * Log a formatted list of conflicted files, truncating to a maximum count
 * and showing a pluralized "remaining" message when there are more.
 */
export function logConflictedFiles(params: LogConflictedFilesParams): void {
    const { conflictedFiles, logger } = params;

    logger.error(`   ${chalk.yellow('Conflicted files:')}`);

    const filesToShow = conflictedFiles.slice(0, MAX_FILES_TO_SHOW);

    for (const file of filesToShow) {
        logger.error(`     ${chalk.red('•')} ${file}`);
    }

    const remaining = conflictedFiles.length - MAX_FILES_TO_SHOW;
    if (remaining > 0) {
        logger.error(`     ${chalk.gray(`...and ${remaining} other file${remaining === 1 ? '' : 's'}`)}`);
    }
}
