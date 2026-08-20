import chalk from 'chalk';

import type { Logger } from '@nzyme/logging/Logger.js';

import type { GithubConfig } from '../GithubConfig.js';
import { convertPrToReady } from './convertPrToReady.js';
import type { GithubClient } from './createGithubClient.js';
import { findMatchingPr } from './findMatchingPr.js';
import { getSubmoduleGithubConfig } from './getSubmoduleGithubConfig.js';
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
     * Main-repository pull requests to take out of draft, bottom to top. An ordinary task has one;
     * a stacked task has one per node, and all of them leave draft together — the human reviews the
     * chain, not whichever node the CLI happened to be standing on.
     */
    mainPrs: ReadyTargetPr[];
}

/**
 * A pull request this function may take out of draft.
 */
export interface ReadyTargetPr {
    /**
     * Pull request number.
     */
    number: number;

    /**
     * Whether it is currently a draft. Absent is treated as "not a draft", matching the API type.
     */
    draft?: boolean;

    /**
     * Pull request URL, for the log.
     */
    html_url: string;
}

/**
 * Convert all of a task's PRs — every main-repository node and every submodule — to ready for review.
 * This function handles:
 * - Converting submodule PRs from draft to ready
 * - Converting each main-repository PR from draft to ready (if needed)
 * - Logging status for all PRs
 */
export async function convertAllPrsToReady(params: ConvertAllPrsToReadyParams): Promise<void> {
    const { githubClient, githubConfig, issueId, logger, mainPrs } = params;

    // Convert submodule PRs to ready
    const submodules = await getSubmoduleInfo();
    if (submodules.length > 0) {
        logger.info('');
        logger.info('🔍 Checking for submodule PRs to mark as ready...');

        for (const submodule of submodules) {
            // Parse the submodule URL to get owner and repo for GitHub config
            const submoduleConfig = getSubmoduleGithubConfig(submodule.url, githubConfig.token);
            if (!submoduleConfig) {
                logger.warn(
                    `⚠️  Could not parse GitHub URL for submodule ${chalk.magenta(submodule.name)}: ${chalk.yellow(submodule.url)}`,
                );
                continue;
            }

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

    // Convert every main-repository PR from draft to ready, bottom to top
    logger.info('');
    if (mainPrs.length > 1) {
        logger.info(`🧱 ${chalk.bold(mainPrs.length.toString())} stacked PRs to mark ready (bottom → top)`);
    }

    for (const mainPr of mainPrs) {
        if (!mainPr.draft) {
            logger.info(`🎉 PR ${chalk.gray(`#${mainPr.number}`)} is already ready for review!`);
        } else {
            logger.info(`🚀 Converting PR ${chalk.gray(`#${mainPr.number}`)} from draft to ready for review...`);
            await convertPrToReady(githubClient, githubConfig, mainPr.number);
            logger.info(`🎉 Successfully converted PR ${chalk.gray(`#${mainPr.number}`)} to ready for review!`);
        }
        logger.info(`🔗 PR URL: ${chalk.blueBright(chalk.underline(mainPr.html_url))}`);
    }
}
