import chalk from 'chalk';

import type { Logger } from '@nzyme/logging/Logger.js';

import type { GithubConfig } from '../GithubConfig.js';
import { checkCurrentPrMerged } from './checkCurrentPrMerged.js';
import { checkUnpushedCommits } from './checkUnpushedCommits.js';
import type { GithubClient } from './createGithubClient.js';
import { findMatchingPr } from './findMatchingPr.js';
import { getGitStatusInfo } from './getGitStatusInfo.js';
import { getSubmoduleInfo } from './getSubmoduleInfo.js';
import { handleReadyPreparation } from './handleReadyPreparation.js';
import { handleSubmoduleReadyPreparation } from './handleSubmoduleReadyPreparation.js';
import { isTaskBranch } from './isTaskBranch.js';

/**
 * Parameters for handling push preparation.
 */
export interface HandlePushPreparationParams {
    /**
     * GitHub client instance.
     */
    githubClient: GithubClient;

    /**
     * GitHub configuration.
     */
    githubConfig: GithubConfig;

    /**
     * Issue/task ID.
     */
    issueId: string;

    /**
     * Logger instance.
     */
    logger: Logger;

    /**
     * Base branch for submodules.
     */
    baseBranch: string;

    /**
     * Whether to skip prompts and automatically commit with default message.
     */
    autoYes?: boolean;

    /**
     * Default commit message to use when committing changes.
     */
    defaultCommitMessage?: string;

    /**
     * Whether the PR is in review (not draft).
     * When true, uses "Fixes after review" as default commit message if defaultCommitMessage is not provided.
     */
    prInReview?: boolean;
}

/**
 * Handle the preparation phase for pushing changes.
 * This includes handling submodule changes and main repository changes.
 * Does NOT convert PR to ready - only prepares changes.
 */
export async function handlePushPreparation(params: HandlePushPreparationParams): Promise<void> {
    const {
        githubClient,
        githubConfig,
        issueId,
        logger,
        baseBranch,
        autoYes,
        defaultCommitMessage,
        prInReview,
    } = params;

    // FIRST: Check if the current branch's PR has been merged
    await checkCurrentPrMerged(githubClient, githubConfig, issueId, logger);

    // SECOND: Handle submodule changes (submodules must be processed before main repo)
    await handleSubmoduleReadyPreparation({
        githubClient,
        githubConfig,
        issueId,
        logger,
        baseBranch,
        autoYes,
    });

    // THIRD: Handle main repository changes (including submodule reference updates)
    logger.info('');
    logger.info(chalk.bold('📤 Pushing main repository...'));
    const [unpushedCommits, statusInfo] = await Promise.all([checkUnpushedCommits(), getGitStatusInfo()]);

    // Determine the actual default commit message based on PR review status
    const actualDefaultMessage = defaultCommitMessage ?? (prInReview ? 'Fixes after review' : 'Work in progress');

    await handleReadyPreparation(unpushedCommits, statusInfo, logger, autoYes, actualDefaultMessage);

    // FOURTH: Display PR links summary
    await displayPrSummary({ githubClient, githubConfig, issueId, logger });
}

async function displayPrSummary(params: {
    githubClient: GithubClient;
    githubConfig: GithubConfig;
    issueId: string;
    logger: Logger;
}): Promise<void> {
    const { githubClient, githubConfig, issueId, logger } = params;

    logger.info('');
    logger.info(chalk.bold('🔗 Pull requests'));

    // Main repo PR
    const mainPr = await findMatchingPr(githubClient, githubConfig, issueId);
    if (mainPr) {
        logger.info(`   main: ${chalk.blueBright(chalk.underline(mainPr.html_url))}`);
    } else {
        logger.info(`   main: no PR found`);
    }

    // Submodule PRs
    const submodules = await getSubmoduleInfo();
    for (const sub of submodules) {
        if (!isTaskBranch(sub.currentBranch)) continue;

        const urlMatch = sub.url.match(/github\.com[:/]([^/]+)\/(.+?)(\.git)?$/);
        if (!urlMatch?.[1] || !urlMatch[2]) continue;

        const subConfig: GithubConfig = {
            owner: urlMatch[1],
            repo: urlMatch[2].replace(/\.git$/, ''),
            token: githubConfig.token,
        };
        const subPr = await findMatchingPr(githubClient, subConfig, issueId);
        if (subPr) {
            logger.info(`   ${chalk.magenta(sub.name)}: ${chalk.blueBright(chalk.underline(subPr.html_url))}`);
        }
    }
}
