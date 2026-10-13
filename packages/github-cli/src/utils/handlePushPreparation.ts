import chalk from 'chalk';

import type { Logger } from '@nzyme/logging/Logger.js';

import type { GithubConfig } from '../GithubConfig.js';
import { checkCurrentPrMerged } from './checkCurrentPrMerged.js';
import { checkUnpushedCommits } from './checkUnpushedCommits.js';
import type { BranchGuard } from './createBranchGuard.js';
import type { GithubClient } from './createGithubClient.js';
import type { GitHubPR } from './findMatchingPr.js';
import { findOpenPrForBranch, findTaskPrs } from './findMatchingPr.js';
import { getGitStatusInfo } from './getGitStatusInfo.js';
import { getSubmoduleGithubConfig } from './getSubmoduleGithubConfig.js';
import { getSubmoduleInfo } from './getSubmoduleInfo.js';
import { handleReadyPreparation } from './handleReadyPreparation.js';
import { handleSubmoduleReadyPreparation } from './handleSubmoduleReadyPreparation.js';
import type { SubmoduleBase } from './resolveSubmoduleBase.js';
import { resolveSubmoduleCurrentBranch } from './resolveSubmoduleCurrentBranch.js';
import type { SubmodulePrLink } from './upsertSubmodulePrLinks.js';
import { upsertSubmodulePrLinks } from './upsertSubmodulePrLinks.js';

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
     * What the submodules follow — see `HandleSubmoduleReadyPreparationParams.submoduleBase`.
     */
    submoduleBase: SubmoduleBase;

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

    /**
     * Guard of the main repository's branch being pushed — see `HandleReadyPreparationParams.guard`.
     */
    guard: BranchGuard;
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
        submoduleBase,
        unattended,
        defaultCommitMessage,
        prInReview,
        guard,
    } = params;

    // FIRST: Check if the current branch's PR has been merged
    await checkCurrentPrMerged(githubClient, githubConfig, issueId, logger);

    // SECOND: Handle submodule changes (submodules must be processed before main repo)
    await handleSubmoduleReadyPreparation({
        githubClient,
        githubConfig,
        logger,
        submoduleBase,
        unattended,
    });

    // THIRD: Handle main repository changes (including submodule reference updates)
    logger.info('');
    logger.info(chalk.bold('📤 Pushing main repository...'));

    // A pinned submodule's gitlink is never committed here, whatever its checkout says: the sync
    // may just have merged in a base that re-pinned it without moving the checkout, and committing
    // the stale checkout would roll that pin back.
    const pinnedPaths = submoduleBase.kind === 'pin' ? (await getSubmoduleInfo()).map(sub => sub.path) : [];
    const [unpushedCommits, statusInfo] = await Promise.all([
        checkUnpushedCommits(),
        getGitStatusInfo(undefined, pinnedPaths),
    ]);

    // Determine the actual default commit message based on PR review status
    const actualDefaultMessage = defaultCommitMessage ?? (prInReview ? 'Fixes after review' : 'Work in progress');

    await handleReadyPreparation({
        unpushedCommits,
        statusInfo,
        logger,
        defaultCommitMessage: actualDefaultMessage,
        guard,
        excludedPaths: pinnedPaths,
    });

    // FOURTH: Display PR links summary
    const { mainPrs, submodulePrs } = await displayPrSummary({
        githubClient,
        githubConfig,
        issueId,
        submoduleBase,
        logger,
    });

    // FIFTH: Link the submodule PRs from every main PR of the task (one submodule PR serves all nodes).
    await linkSubmodulePrs({ githubClient, githubConfig, mainPrs, submodulePrs, logger });
}

/**
 * The pull requests of a task, as collected by `displayPrSummary`.
 */
interface TaskPrs {
    /**
     * One per stack node, bottom to top.
     */
    mainPrs: GitHubPR[];

    /**
     * Empty for a pinned submodule.
     */
    submodulePrs: SubmodulePrLink[];
}

/**
 * Parameters for logging the task's pull requests.
 */
interface DisplayPrSummaryParams {
    githubClient: GithubClient;
    githubConfig: GithubConfig;
    issueId: string;
    submoduleBase: SubmoduleBase;
    logger: Logger;
}

/**
 * Log the task's pull requests and return them.
 */
async function displayPrSummary(params: DisplayPrSummaryParams): Promise<TaskPrs> {
    const { githubClient, githubConfig, issueId, submoduleBase, logger } = params;

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

    // A pinned submodule carries no pull request of this task's: whatever branch its pin sits on
    // belongs to the submodule alone.
    if (submoduleBase.kind === 'pin') {
        return { mainPrs, submodulePrs: [] };
    }

    // Submodule PRs — resolved by branch (never skipped for a detached HEAD, the ordinary state for
    // a gitlink-pinned submodule; see `resolveSubmoduleCurrentBranch`), not by issue ID.
    const submodulePrs: SubmodulePrLink[] = [];
    const submodules = await getSubmoduleInfo();
    for (const sub of submodules) {
        const subConfig = getSubmoduleGithubConfig(sub.url, githubConfig.token);
        if (!subConfig) {
            continue;
        }

        const resolved = await resolveSubmoduleCurrentBranch({ submodule: sub, trunk: submoduleBase.trunk });
        if (resolved.kind === 'base') {
            continue;
        }

        const subPr = await findOpenPrForBranch(githubClient, subConfig, resolved.name);
        if (subPr) {
            logger.info(`   ${chalk.magenta(sub.name)}: ${chalk.blueBright(chalk.underline(subPr.html_url))}`);
            submodulePrs.push({
                submodule: sub.name,
                owner: subConfig.owner,
                repo: subConfig.repo,
                number: subPr.number,
                title: subPr.title,
                url: subPr.html_url,
            });
        }
    }

    return { mainPrs, submodulePrs };
}

/**
 * Parameters for linking the submodule PRs from the main PRs.
 */
interface LinkSubmodulePrsParams {
    githubClient: GithubClient;
    githubConfig: GithubConfig;
    mainPrs: GitHubPR[];
    submodulePrs: SubmodulePrLink[];
    logger: Logger;
}

/**
 * Keep each main PR's managed "Submodule PRs" block in step with the submodule PRs found now — see
 * `upsertSubmodulePrLinks`. Best-effort: the push has already happened, so a failed description
 * update is reported and never fails it.
 */
async function linkSubmodulePrs(params: LinkSubmodulePrsParams): Promise<void> {
    const { githubClient, githubConfig, mainPrs, submodulePrs, logger } = params;

    for (const pr of mainPrs) {
        try {
            const body = upsertSubmodulePrLinks(pr.body, submodulePrs);
            if (body === null) {
                continue;
            }

            await githubClient.rest.pulls.update({
                owner: githubConfig.owner,
                repo: githubConfig.repo,
                pull_number: pr.number,
                body,
            });
        } catch (error) {
            logger.warn(
                `   ⚠️  Could not link submodule PRs in ${pr.html_url} — push went through, update it by hand.`,
                {
                    error,
                },
            );
        }
    }
}
