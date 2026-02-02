import chalk from 'chalk';
import type { SimpleGit } from 'simple-git';
import { simpleGit } from 'simple-git';

import type { Logger } from '@nzyme/logging';

export interface FetchAndRebaseCurrentBranchParams {
    logger: Logger;
    git?: SimpleGit;
    repoDisplayName?: string;
}

export interface FetchAndRebaseCurrentBranchResult {
    hadRemoteChanges: boolean;
    commitsRebased: number;
}

/**
 * Fetch from origin and rebase the current branch onto the remote tracking branch.
 * This ensures we have any remote commits before doing other operations.
 */
export async function fetchAndRebaseCurrentBranch(
    params: FetchAndRebaseCurrentBranchParams,
): Promise<FetchAndRebaseCurrentBranchResult> {
    const { logger, git = simpleGit(), repoDisplayName = 'repository' } = params;

    const status = await git.status();
    const currentBranch = status.current;

    if (!currentBranch) {
        logger.warn(`⚠️  Could not determine current branch in ${repoDisplayName}`);
        return { hadRemoteChanges: false, commitsRebased: 0 };
    }

    // Fetch from origin
    logger.info(`🔄 Fetching latest changes for ${chalk.cyan(currentBranch)} in ${repoDisplayName}...`);
    await git.fetch('origin', currentBranch);

    // Check if there are commits on origin that we don't have
    let commitsAhead = 0;
    try {
        const result = await git.raw(['rev-list', '--count', `${currentBranch}..origin/${currentBranch}`]);
        commitsAhead = parseInt(result.trim(), 10);
    } catch {
        // Remote branch may not exist yet
        commitsAhead = 0;
    }

    if (commitsAhead === 0) {
        logger.info(`✅ ${repoDisplayName} is up to date with remote`);
        return { hadRemoteChanges: false, commitsRebased: 0 };
    }

    logger.info(
        `📥 Remote has ${chalk.yellow(commitsAhead.toString())} commit${commitsAhead === 1 ? '' : 's'} to pull`,
    );

    // Pull with rebase
    logger.info(`🔀 Rebasing onto origin/${chalk.cyan(currentBranch)}...`);
    await git.pull('origin', currentBranch, { '--rebase': null });
    logger.info(`✅ Successfully rebased ${repoDisplayName}`);

    return { hadRemoteChanges: true, commitsRebased: commitsAhead };
}
