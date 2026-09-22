import chalk from 'chalk';

import type { Logger } from '@nzyme/logging/Logger.js';

import type { GithubConfig } from '../GithubConfig.js';
import { checkCurrentPrMerged } from './checkCurrentPrMerged.js';
import { checkUnpushedCommits } from './checkUnpushedCommits.js';
import type { GithubClient } from './createGithubClient.js';
import { findOpenPrForBranch, findTaskPrs } from './findMatchingPr.js';
import { getGitStatusInfo } from './getGitStatusInfo.js';
import { getSubmoduleGithubConfig } from './getSubmoduleGithubConfig.js';
import { getSubmoduleInfo } from './getSubmoduleInfo.js';
import { handleReadyPreparation } from './handleReadyPreparation.js';
import { handleSubmoduleReadyPreparation } from './handleSubmoduleReadyPreparation.js';
import { resolveSubmoduleCurrentBranch } from './resolveSubmoduleCurrentBranch.js';

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
     * The caller project's base branches, used to tell a submodule resting on a base branch apart
     * from one carrying work of its own — see `HandleSubmoduleReadyPreparationParams.baseBranches`.
     * Separate from {@link baseBranch} because that one is a pull request target and, on a stacked
     * task, a node branch.
     */
    baseBranches: string[];

    /**
     * Whether nobody can be asked a question — see `decideUnattendedMode`. It is the single flag
     * for both things this path used to express separately: skip the prompts (there is nobody to
     * answer them), and refuse rather than guess when a submodule is not in a state to proceed.
     */
    unattended: boolean;

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
        baseBranches,
        unattended,
        defaultCommitMessage,
        prInReview,
    } = params;

    // FIRST: Check if the current branch's PR has been merged
    await checkCurrentPrMerged(githubClient, githubConfig, issueId, logger);

    // SECOND: Handle submodule changes (submodules must be processed before main repo)
    await handleSubmoduleReadyPreparation({
        githubClient,
        githubConfig,
        logger,
        baseBranch,
        baseBranches,
        unattended,
    });

    // THIRD: Handle main repository changes (including submodule reference updates)
    logger.info('');
    logger.info(chalk.bold('📤 Pushing main repository...'));
    const [unpushedCommits, statusInfo] = await Promise.all([checkUnpushedCommits(), getGitStatusInfo()]);

    // Determine the actual default commit message based on PR review status
    const actualDefaultMessage = defaultCommitMessage ?? (prInReview ? 'Fixes after review' : 'Work in progress');

    await handleReadyPreparation(unpushedCommits, statusInfo, logger, actualDefaultMessage);

    // FOURTH: Display PR links summary
    await displayPrSummary({ githubClient, githubConfig, issueId, baseBranches, logger });
}

async function displayPrSummary(params: {
    githubClient: GithubClient;
    githubConfig: GithubConfig;
    issueId: string;
    baseBranches: string[];
    logger: Logger;
}): Promise<void> {
    const { githubClient, githubConfig, issueId, baseBranches, logger } = params;

    logger.info('');
    logger.info(chalk.bold('🔗 Pull requests'));

    // Main repo PRs — a stacked task has one per node, listed bottom to top.
    const mainPrs = await findTaskPrs(githubClient, githubConfig, issueId);
    if (mainPrs.length === 0) {
        logger.info(`   main: no PR found`);
    } else if (mainPrs.length === 1) {
        logger.info(`   main: ${chalk.blueBright(chalk.underline(mainPrs[0]!.html_url))}`);
    } else {
        mainPrs.forEach((pr, index) => {
            logger.info(`   main (${index + 1}/${mainPrs.length}): ${chalk.blueBright(chalk.underline(pr.html_url))}`);
        });
    }

    // Submodule PRs — resolved by branch (never skipped for a detached HEAD, the ordinary state for
    // a gitlink-pinned submodule; see `resolveSubmoduleCurrentBranch`), not by issue ID.
    const submodules = await getSubmoduleInfo();
    for (const sub of submodules) {
        const subConfig = getSubmoduleGithubConfig(sub.url, githubConfig.token);
        if (!subConfig) {
            continue;
        }

        const resolved = await resolveSubmoduleCurrentBranch({ submodule: sub, baseBranches });
        if (resolved.kind === 'base') {
            continue;
        }

        const subPr = await findOpenPrForBranch(githubClient, subConfig, resolved.name);
        if (subPr) {
            logger.info(`   ${chalk.magenta(sub.name)}: ${chalk.blueBright(chalk.underline(subPr.html_url))}`);
        }
    }
}
