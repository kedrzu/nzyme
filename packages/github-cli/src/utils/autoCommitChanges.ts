import chalk from 'chalk';
import type { SimpleGit } from 'simple-git';
import { simpleGit } from 'simple-git';

import type { Logger } from '@nzyme/logging/Logger.js';

import { assertNoConflicts } from './assertNoConflicts.js';
import { getGitStatusInfo } from './getGitStatusInfo.js';

/**
 * Parameters for auto-committing changes.
 */
export interface AutoCommitChangesParams {
    /**
     * Logger instance.
     */
    logger: Logger;

    /**
     * Optional SimpleGit instance (uses current directory if not provided).
     */
    git?: SimpleGit;

    /**
     * Repository display name for logging.
     */
    repoDisplayName?: string;

    /**
     * Commit message to use.
     * @default 'Work in progress'
     */
    commitMessage?: string;
}

/**
 * Result of auto-committing changes.
 */
export interface AutoCommitChangesResult {
    /**
     * Whether a commit was created.
     */
    committed: boolean;
}

/**
 * Auto-commit all pending changes without prompting.
 * Does NOT push - that is handled separately after fetch/rebase.
 */
export async function autoCommitChanges(params: AutoCommitChangesParams): Promise<AutoCommitChangesResult> {
    const { logger, git = simpleGit(), repoDisplayName = 'repository', commitMessage = 'Work in progress' } = params;

    const statusInfo = await getGitStatusInfo(git);

    if (statusInfo.changes.conflicted > 0) {
        await assertNoConflicts({ git, repoDisplayName, logger });
    }

    if (!statusInfo.hasUncommittedChanges) {
        return { committed: false };
    }

    logger.info(
        `   ${chalk.yellow(statusInfo.totalChanges.toString())} uncommitted change${statusInfo.totalChanges === 1 ? '' : 's'} in ${repoDisplayName}: ${chalk.yellow(statusInfo.changeDescription)}`,
    );

    await git.add('.');
    await git.commit(commitMessage);

    logger.info(`   ${chalk.green('✓')} Committed in ${repoDisplayName} with message: "${chalk.cyan(commitMessage)}"`);

    return { committed: true };
}
