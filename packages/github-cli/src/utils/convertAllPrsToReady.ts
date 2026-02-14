import chalk from 'chalk';

import type { Logger } from '@nzyme/logging/Logger.js';

import type { GithubConfig } from '../GithubConfig.js';
import { convertPrToReady } from './convertPrToReady.js';
import type { GithubClient } from './createGithubClient.js';
import { findMatchingPr } from './findMatchingPr.js';
import { getSubmoduleInfo } from './getSubmoduleInfo.js';

/**
 * Parameters for converting all PRs to ready.
 */
export interface ConvertAllPrsToReadyParams {
    /**
     * GitHub client instance.
     */
    githubClient: GithubClient;

    /**
     * GitHub configuration for the main repository.
     */
    githubConfig: GithubConfig;

    /**
     * Issue/task ID for PR identification.
     */
    issueId: string;

    /**
     * Logger instance.
     */
    logger: Logger;

    /**
     * The main repository PR number.
     */
    mainPrNumber: number;

    /**
     * Whether the main PR is currently a draft.
     */
    mainPrIsDraft: boolean | undefined;

    /**
     * URL of the main PR.
     */
    mainPrUrl: string;

    /**
     * Whether to skip submodule processing.
     */
    skipSubmodules?: boolean;
}

/**
 * Convert all PRs (main and submodules) to ready for review.
 * This function handles:
 * - Converting submodule PRs from draft to ready (if not skipped)
 * - Converting main PR from draft to ready (if needed)
 * - Logging status for all PRs
 */
export async function convertAllPrsToReady(params: ConvertAllPrsToReadyParams): Promise<void> {
    const { githubClient, githubConfig, issueId, logger, mainPrNumber, mainPrIsDraft, mainPrUrl, skipSubmodules } =
        params;

    // Convert submodule PRs to ready
    if (!skipSubmodules) {
        const submodules = await getSubmoduleInfo();
        if (submodules.length > 0) {
            logger.info('');
            logger.info('🔍 Checking for submodule PRs to mark as ready...');

            for (const submodule of submodules) {
                // Parse the submodule URL to get owner and repo for GitHub config
                const urlMatch = submodule.url.match(/github\.com[:/]([^/]+)\/(.+?)(\.git)?$/);
                if (!urlMatch) {
                    logger.warn(
                        `⚠️  Could not parse GitHub URL for submodule ${chalk.magenta(submodule.name)}: ${chalk.yellow(submodule.url)}`,
                    );
                    continue;
                }

                const [, owner, repo] = urlMatch;
                if (!owner || !repo) {
                    logger.warn(
                        `⚠️  Could not extract owner/repo from URL for submodule ${chalk.magenta(submodule.name)}`,
                    );
                    continue;
                }

                const submoduleConfig: GithubConfig = {
                    owner,
                    repo: repo.replace(/\.git$/, ''),
                    token: githubConfig.token,
                };

                try {
                    // Find PR for this submodule
                    const submodulePr = await findMatchingPr(githubClient, submoduleConfig, issueId);

                    if (submodulePr) {
                        if (submodulePr.draft) {
                            logger.info(
                                `🚀 Converting submodule ${chalk.magenta(submodule.name)} PR ${chalk.gray(`#${submodulePr.number}`)} to ready...`,
                            );
                            await convertPrToReady(githubClient, submoduleConfig, submodulePr.number);
                            logger.info(
                                `✅ Submodule ${chalk.magenta(submodule.name)} PR ${chalk.gray(`#${submodulePr.number}`)} is now ready for review`,
                            );
                            logger.info(`🔗 PR URL: ${chalk.blueBright(chalk.underline(submodulePr.html_url))}`);
                        } else {
                            logger.info(
                                `✅ Submodule ${chalk.magenta(submodule.name)} PR ${chalk.gray(`#${submodulePr.number}`)} is already ready`,
                            );
                            logger.info(`🔗 PR URL: ${chalk.blueBright(chalk.underline(submodulePr.html_url))}`);
                        }
                    } else {
                        logger.info(`ℹ️  No PR found for submodule ${chalk.magenta(submodule.name)} - skipping`);
                    }
                } catch (error: unknown) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    logger.warn(
                        `⚠️  Failed to convert submodule ${chalk.magenta(submodule.name)} PR to ready: ${errorMessage}`,
                    );
                }
            }
        }
    }

    // Convert main PR from draft to ready
    logger.info('');
    if (!mainPrIsDraft) {
        logger.info(`🎉 PR ${chalk.gray(`#${mainPrNumber}`)} is already ready for review!`);
        logger.info(`🔗 PR URL: ${chalk.blueBright(chalk.underline(mainPrUrl))}`);
    } else {
        logger.info('🚀 Converting main PR from draft to ready for review...');
        await convertPrToReady(githubClient, githubConfig, mainPrNumber);
        logger.info(`🎉 Successfully converted PR ${chalk.gray(`#${mainPrNumber}`)} to ready for review!`);
        logger.info(`🔗 PR URL: ${chalk.blueBright(chalk.underline(mainPrUrl))}`);
    }
}
