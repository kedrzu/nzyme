import chalk from 'chalk';
import type { SimpleGit } from 'simple-git';
import { simpleGit } from 'simple-git';

import type { Logger } from '@nzyme/logging/Logger.js';

import { assertNoConflicts } from './assertNoConflicts.js';
import { describeChangedPaths } from './describeChangedPaths.js';
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
     * Commit message to fall back to when there is nothing to describe. Whenever
     * `describeChangedPaths` can name what changed, it is combined with this message rather than
     * replacing it — e.g. `'Work in progress: packages/cli/src/git'`.
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
 *
 * The commit message is always generated, never asked for: `commitMessage` names *why* (its
 * caller-supplied default), and `describeChangedPaths` names *what* changed. Combined when both
 * are available, the fallback alone otherwise.
 */
export async function autoCommitChanges(params: AutoCommitChangesParams): Promise<AutoCommitChangesResult> {
    const { logger, git = simpleGit(), repoDisplayName = 'repository', commitMessage = 'Work in progress' } = params;

    const statusInfo = await getGitStatusInfo(git);

    if (statusInfo.changes.conflicted > 0) {
        await assertNoConflicts({ git, repoDisplayName, operation: 'merge', logger });
    }

    if (!statusInfo.hasUncommittedChanges) {
        return { committed: false };
    }

    logger.info(
        `   ${chalk.yellow(statusInfo.totalChanges.toString())} uncommitted change${statusInfo.totalChanges === 1 ? '' : 's'} in ${repoDisplayName}: ${chalk.yellow(statusInfo.changeDescription)}`,
    );

    const description = describeChangedPaths(statusInfo.changedPaths);
    const message = description ? `${commitMessage}: ${description}` : commitMessage;

    await git.add('.');
    await git.commit(message);

    logger.info(`   ${chalk.green('✓')} Committed in ${repoDisplayName} with message: "${chalk.cyan(message)}"`);

    return { committed: true };
}
