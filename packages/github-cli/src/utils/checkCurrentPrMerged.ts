import chalk from 'chalk';

import { UsageError } from '@nzyme/cli';
import type { Logger } from '@nzyme/logging';

import type { GithubConfig } from '../GithubConfig.js';
import type { GithubClient } from './createGithubClient.js';
import { findAllMatchingPrs } from './findMatchingPr.js';
import { getCurrentBranch } from './getCurrentBranch.js';

/**
 * Check if the current branch's PR has been merged.
 * Throws an error with helpful message if the PR was merged.
 */
export async function checkCurrentPrMerged(
    githubClient: GithubClient,
    githubConfig: GithubConfig,
    issueId: string,
    logger: Logger,
): Promise<void> {
    const currentBranch = await getCurrentBranch();
    const allMatchingPrs = await findAllMatchingPrs(githubClient, githubConfig, issueId);

    // Find PR that matches the current branch exactly
    const currentBranchPr = allMatchingPrs.find(pr => pr.head.ref === currentBranch);

    if (currentBranchPr && currentBranchPr.merged_at) {
        logger.error(`❌ Current branch ${chalk.cyan(currentBranch)} PR is already merged!`);
        logger.error(`   PR #${currentBranchPr.number} was merged at ${currentBranchPr.merged_at}`);
        logger.error(`   Base branch: ${chalk.cyan(currentBranchPr.base.ref)}`);
        logger.error('');
        logger.error('🔧 To fix this:');
        logger.error(`   1. Use "${chalk.cyan('task ready')}" to automatically create a new version of this task`);
        logger.error(`   2. Or manually switch to a different task with "${chalk.cyan(`task ${issueId}`)}"`);
        throw new UsageError(
            `Cannot push to branch ${currentBranch} - PR #${currentBranchPr.number} is already merged. ` +
                `Please create a new branch version or switch tasks.`,
        );
    }
}
