import chalk from 'chalk';
import enquirer from 'enquirer';
import { simpleGit } from 'simple-git';

import type { Logger } from '@nzyme/logging';

import type { GithubConfig } from '../GithubConfig.js';
import type { GithubClient } from './createGithubClient.js';
import { ensureRepositoryReady } from './ensureRepositoryReady.js';
import { getCurrentBranch } from './getCurrentBranch.js';
import type { SubmoduleInfo } from './getSubmoduleInfo.js';
import { getSubmoduleInfo } from './getSubmoduleInfo.js';

/**
 * Parameters for handling submodule preparation.
 */
export interface HandleSubmoduleReadyPreparationParams {
    /**
     * GitHub client instance.
     */
    githubClient: GithubClient;

    /**
     * GitHub configuration.
     */
    githubConfig: GithubConfig;

    /**
     * Issue/task ID for PR creation.
     */
    issueId: string;

    /**
     * Logger instance.
     */
    logger: Logger;

    /**
     * Base branch for creating PRs.
     */
    baseBranch: string;
}

/**
 * Parameters for handling a single submodule.
 */
interface HandleSingleSubmoduleParams {
    /**
     * Submodule information.
     */
    submodule: SubmoduleInfo;

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
     * Base branch for the main repository.
     */
    baseBranch: string;

    /**
     * Current branch name from main repository.
     */
    mainRepoBranch: string;
}

/**
 * Handle submodule preparation before marking a PR as ready.
 * This checks for changes in submodules and handles committing/pushing/creating PRs as needed.
 * Updates submodule references in the main repository (which should be committed separately).
 */
export async function handleSubmoduleReadyPreparation(params: HandleSubmoduleReadyPreparationParams): Promise<void> {
    const { githubClient, githubConfig, issueId, logger, baseBranch } = params;

    logger.info('🔍 Checking for submodule changes...');
    const submodules = await getSubmoduleInfo();

    if (submodules.length === 0) {
        logger.info('✅ No submodules found in repository');
        return;
    }

    // Filter submodules that have changes or unpushed commits
    const submodulesWithChanges = submodules.filter(sub => sub.hasChanges || sub.unpushedCommitsCount > 0);

    if (submodulesWithChanges.length === 0) {
        logger.info('✅ No changes found in submodules');
        return;
    }

    logger.info(
        `⚠️  Found ${chalk.yellow(submodulesWithChanges.length.toString())} submodule${
            submodulesWithChanges.length === 1 ? '' : 's'
        } with changes:`,
    );

    for (const submodule of submodulesWithChanges) {
        logger.info(`   • ${chalk.cyan(submodule.name)} (${submodule.path})`);
        if (submodule.hasChanges) {
            logger.info(`     - Uncommitted changes`);
        }
        if (submodule.unpushedCommitsCount > 0) {
            logger.info(
                `     - ${submodule.unpushedCommitsCount} unpushed commit${submodule.unpushedCommitsCount === 1 ? '' : 's'}`,
            );
        }
    }

    const { shouldProceed } = await enquirer.prompt<{ shouldProceed: boolean }>({
        type: 'select',
        name: 'shouldProceed',
        message: 'Do you want to handle these submodule changes now?',
        choices: [
            {
                name: 'yes',
                message: 'Yes, process submodule changes',
                value: true,
            },
            {
                name: 'no',
                message: 'No, skip submodule handling',
                value: false,
            },
        ],
    });

    if (!shouldProceed) {
        logger.info('⏭️  Skipping submodule handling');
        return;
    }

    // Get the current branch name from main repo to use as template
    const mainRepoBranch = await getCurrentBranch();

    // Process each submodule
    for (const submodule of submodulesWithChanges) {
        logger.info('');
        logger.info(chalk.bold.blue(`📦 Processing submodule: ${chalk.cyan(submodule.name)}`));

        await handleSingleSubmodule({
            submodule,
            githubClient,
            githubConfig,
            issueId,
            logger,
            baseBranch,
            mainRepoBranch,
        });
    }

    logger.info('');
    logger.info('✅ All submodule changes processed');
    logger.info('ℹ️  Submodule references have been updated in the main repository');
}

async function handleSingleSubmodule(params: HandleSingleSubmoduleParams): Promise<void> {
    const { submodule, githubClient, githubConfig, issueId, logger, baseBranch, mainRepoBranch } = params;

    const submoduleGit = simpleGit({ baseDir: submodule.path });

    // Ensure we're on the correct branch (same as main repo if possible)
    if (submodule.currentBranch !== mainRepoBranch) {
        try {
            logger.info(`🌿 Checking out branch ${chalk.cyan(mainRepoBranch)} in submodule...`);
            const branches = await submoduleGit.branchLocal();

            if (branches.all.includes(mainRepoBranch)) {
                await submoduleGit.checkout(mainRepoBranch);
            } else {
                // Branch doesn't exist, create it from current branch
                await submoduleGit.checkoutLocalBranch(mainRepoBranch);
            }
            logger.info(`✅ Checked out branch ${chalk.cyan(mainRepoBranch)}`);
        } catch (error) {
            logger.warn(`⚠️  Could not checkout branch ${chalk.cyan(mainRepoBranch)}: ${(error as Error).message}`);
            logger.info(`ℹ️  Continuing with current branch: ${chalk.cyan(submodule.currentBranch || 'unknown')}`);
        }
    }

    // Parse the submodule URL to get owner and repo for GitHub config
    const urlMatch = submodule.url.match(/github\.com[:/]([^/]+)\/(.+?)(\.git)?$/);
    if (!urlMatch) {
        const errorMessage = `Could not parse GitHub URL for submodule: ${submodule.url}`;
        logger.error(`❌ ${errorMessage}`);
        throw new Error(errorMessage);
    }

    const [, owner, repo] = urlMatch;
    if (!owner || !repo) {
        const errorMessage = `Could not extract owner/repo from URL: ${submodule.url}`;
        logger.error(`❌ ${errorMessage}`);
        throw new Error(errorMessage);
    }

    const submoduleConfig: GithubConfig = {
        owner,
        repo: repo.replace(/\.git$/, ''),
        token: githubConfig.token,
    };

    // Use the unified ensureRepositoryReady function to handle commits, push, and PR creation
    await ensureRepositoryReady({
        githubClient,
        githubConfig: submoduleConfig,
        issueId,
        logger,
        baseBranch,
        git: submoduleGit,
        repoDisplayName: `submodule ${submodule.name}`,
        generatePrTitle: (id: string) => `[${id}] Submodule changes for ${submodule.name}`,
        generatePrBody: (id: string) =>
            `# [${id}] Submodule changes\n\nThis PR contains changes to the ${submodule.name} submodule.`,
        defaultCommitMessage: `[${issueId}] Submodule changes`,
    });

    // Update the submodule reference in the main repository
    logger.info(`🔄 Updating submodule reference in main repository...`);
    const mainGit = simpleGit();
    await mainGit.add(submodule.path);
    logger.info(`✅ Submodule reference updated`);
}
