import chalk from 'chalk';
import enquirer from 'enquirer';
import open from 'open';

import type { Logger } from '@nzyme/logging/Logger.js';

import type { GithubConfig } from '../GithubConfig.js';
import type { GithubClient } from './createGithubClient.js';
import { findMatchingPr } from './findMatchingPr.js';
import { getSubmoduleInfo } from './getSubmoduleInfo.js';

/**
 * Information about a PR available for opening.
 */
export interface PrInfo {
    /**
     * The repository name (e.g., "sigma", "nzyme").
     */
    repoName: string;

    /**
     * The display type (either "repository" or "submodule").
     */
    displayType: 'repository' | 'submodule';

    /**
     * The PR URL.
     */
    url: string;

    /**
     * The PR number.
     */
    number: number;

    /**
     * The PR title.
     */
    title: string;
}

/**
 * Parameters for selecting a PR to open.
 */
export interface SelectPrToOpenParams {
    /**
     * GitHub client.
     */
    githubClient: GithubClient;

    /**
     * GitHub configuration for the main repository.
     */
    githubConfig: GithubConfig;

    /**
     * The issue/task ID to search for.
     */
    issueId: string;
}

/**
 * Select a PR to open from the main repository and submodules.
 * If multiple PRs are found, prompts the user to choose one.
 * If only one PR is found, returns it without prompting.
 */
export async function selectPrToOpen(params: SelectPrToOpenParams): Promise<PrInfo> {
    const { githubClient, githubConfig, issueId } = params;

    const availablePrs: PrInfo[] = [];

    // Check main repository PR
    const mainPr = await findMatchingPr(githubClient, githubConfig, issueId);

    if (mainPr) {
        availablePrs.push({
            repoName: githubConfig.repo,
            displayType: 'repository',
            url: mainPr.html_url,
            number: mainPr.number,
            title: mainPr.title,
        });
    }

    // Check for submodule PRs
    const submodules = await getSubmoduleInfo();
    if (submodules.length > 0) {
        for (const submodule of submodules) {
            const urlMatch = submodule.url.match(/github\.com[:/]([^/]+)\/(.+?)(\.git)?$/);
            if (!urlMatch) {
                continue;
            }

            const [, owner, repo] = urlMatch;
            if (!owner || !repo) {
                continue;
            }

            const submoduleConfig: GithubConfig = {
                owner,
                repo: repo.replace(/\.git$/, ''),
                token: githubConfig.token,
            };

            try {
                const submodulePr = await findMatchingPr(githubClient, submoduleConfig, issueId);
                if (submodulePr) {
                    availablePrs.push({
                        repoName: submodule.name,
                        displayType: 'submodule',
                        url: submodulePr.html_url,
                        number: submodulePr.number,
                        title: submodulePr.title,
                    });
                }
            } catch {
                // Ignore errors for individual submodules
            }
        }
    }

    if (availablePrs.length === 0) {
        throw new Error(`No GitHub PR found for ${issueId}`);
    }

    // If only one PR, return it without prompting
    if (availablePrs.length === 1) {
        return availablePrs[0]!;
    }

    // Multiple PRs - let user choose
    const { prChoice } = await enquirer.prompt<{ prChoice: string }>({
        type: 'select',
        name: 'prChoice',
        message: 'Multiple PRs found. Which one would you like to open?',
        choices: availablePrs.map((pr, index) => ({
            name: index.toString(),
            message: formatPrChoice(pr),
        })),
    });

    return availablePrs[Number.parseInt(prChoice, 10)]!;
}

/**
 * Parameters for opening a PR in the browser.
 */
export interface OpenPrInBrowserParams extends SelectPrToOpenParams {
    /**
     * Logger for outputting messages.
     */
    logger: Logger;
}

/**
 * Select and open a PR in the browser.
 * Finds all available PRs (main repo + submodules), prompts user to choose if multiple exist,
 * and opens the selected PR in the default browser.
 */
export async function openPrInBrowser(params: OpenPrInBrowserParams): Promise<PrInfo> {
    const { logger, ...selectParams } = params;

    // Select the PR to open
    const selectedPr = await selectPrToOpen(selectParams);

    // Format the repository name with color
    const repoColor = selectedPr.displayType === 'repository' ? chalk.cyan : chalk.magenta;
    logger.info(
        `🚀 Opening ${repoColor(selectedPr.repoName)} ${selectedPr.displayType} PR ${chalk.gray(`#${selectedPr.number}`)} in browser...`,
    );
    logger.info(`🔗 URL: ${chalk.blueBright(chalk.underline(selectedPr.url))}`);

    // Open in browser
    await open(selectedPr.url);

    logger.info(`✅ PR opened successfully!`);

    return selectedPr;
}

/**
 * Format a PR choice for display in the selection menu.
 * @__NO_SIDE_EFFECTS__
 */
function formatPrChoice(pr: PrInfo): string {
    const repoName = pr.displayType === 'repository' ? chalk.cyan(pr.repoName) : chalk.magenta(pr.repoName);
    const displayType = pr.displayType === 'repository' ? 'repository' : 'submodule';

    return `${repoName} ${displayType} ${chalk.gray(`#${pr.number}`)} - ${chalk.white(pr.title)}`;
}
