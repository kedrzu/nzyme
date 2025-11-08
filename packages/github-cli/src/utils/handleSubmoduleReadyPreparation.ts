import chalk from 'chalk';
import enquirer from 'enquirer';
import { simpleGit } from 'simple-git';

import type { Logger } from '@nzyme/logging';

import type { GithubConfig } from '../GithubConfig.js';
import { createDraftPr } from './createDraftPr.js';
import type { GithubClient } from './createGithubClient.js';
import { findMatchingPr } from './findMatchingPr.js';
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
 * Parameters for creating a submodule PR.
 */
interface CreateSubmodulePrParams {
    /**
     * GitHub client instance.
     */
    githubClient: GithubClient;

    /**
     * GitHub configuration.
     */
    githubConfig: GithubConfig;

    /**
     * Submodule information.
     */
    submodule: SubmoduleInfo;

    /**
     * Branch name in the submodule.
     */
    branchName: string;

    /**
     * Issue/task ID.
     */
    issueId: string;

    /**
     * Base branch.
     */
    baseBranch: string;

    /**
     * Logger instance.
     */
    logger: Logger;
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

    const currentBranch = (await submoduleGit.status()).current || mainRepoBranch;

    // Handle uncommitted changes
    if (submodule.hasChanges) {
        logger.info(`📝 Submodule has uncommitted changes`);

        const status = await submoduleGit.status();
        const hasStagedFiles = status.staged.length > 0;
        const hasUnstagedFiles = status.files.length > status.staged.length;

        // Add unstaged changes to staging if there are any
        if (hasUnstagedFiles) {
            logger.info(`📦 Adding all changes to staging...`);
            await submoduleGit.add('.');
        } else if (hasStagedFiles) {
            logger.info(`📦 Using already staged files...`);
        }

        // Prompt for commit message
        const { commitMessage } = await enquirer.prompt<{ commitMessage: string }>({
            type: 'input',
            name: 'commitMessage',
            message: `Enter commit message for ${chalk.cyan(submodule.name)}:`,
            initial: `[${issueId}] Submodule changes`,
            validate: (input: string) => {
                if (!input.trim()) {
                    return 'Commit message cannot be empty';
                }
                return true;
            },
        });

        // Commit the changes
        logger.info(`💾 Committing changes with message: "${chalk.cyan(commitMessage)}"`);
        await submoduleGit.commit(commitMessage.trim());
        logger.info(`✅ Changes committed`);
    }

    // Handle unpushed commits and branch creation
    if (!submodule.hasRemoteBranch) {
        logger.info(`🌿 Branch ${chalk.cyan(currentBranch)} doesn't exist on remote`);
        logger.info(`🚀 Creating remote branch and pushing...`);

        // Push the branch
        await submoduleGit.push('origin', currentBranch, { '--set-upstream': null });
        logger.info(`✅ Pushed branch to origin`);

        // Try to create a draft PR for the submodule
        await createSubmodulePr({
            githubClient,
            githubConfig,
            submodule,
            branchName: currentBranch,
            issueId,
            baseBranch,
            logger,
        });
    } else if (submodule.unpushedCommitsCount > 0) {
        logger.info(
            `🚀 Pushing ${chalk.yellow(submodule.unpushedCommitsCount.toString())} unpushed commit${
                submodule.unpushedCommitsCount === 1 ? '' : 's'
            }...`,
        );
        await submoduleGit.push();
        logger.info(`✅ Successfully pushed commits`);
    }

    // Update the submodule reference in the main repository
    logger.info(`🔄 Updating submodule reference in main repository...`);
    const mainGit = simpleGit();
    await mainGit.add(submodule.path);
    logger.info(`✅ Submodule reference updated`);
}

async function createSubmodulePr(params: CreateSubmodulePrParams): Promise<void> {
    const { githubClient, submodule, branchName, issueId, baseBranch, logger } = params;

    try {
        // Parse the submodule URL to get owner and repo
        const urlMatch = submodule.url.match(/github\.com[:/]([^/]+)\/(.+?)(\.git)?$/);
        if (!urlMatch) {
            logger.warn(`⚠️  Could not parse GitHub URL for submodule: ${submodule.url}`);
            logger.info(`ℹ️  Skipping PR creation for ${chalk.cyan(submodule.name)}`);
            return;
        }

        const [, owner, repo] = urlMatch;
        if (!owner || !repo) {
            logger.warn(`⚠️  Could not extract owner/repo from URL: ${submodule.url}`);
            return;
        }

        const submoduleConfig: GithubConfig = {
            owner,
            repo: repo.replace(/\.git$/, ''),
            token: params.githubConfig.token,
        };

        // Check if PR already exists
        logger.info(`🔍 Checking if PR already exists for ${chalk.cyan(submodule.name)}...`);
        const existingPr = await findMatchingPr(githubClient, submoduleConfig, issueId);

        if (existingPr) {
            logger.info(`✅ PR already exists: ${chalk.blue(existingPr.title)} (#${existingPr.number})`);
            logger.info(`🔗 PR URL: ${chalk.blueBright(chalk.underline(existingPr.html_url))}`);
            return;
        }

        // Create PR
        logger.info(`📝 Creating draft PR for submodule ${chalk.cyan(submodule.name)}...`);

        const prTitle = `[${issueId}] Submodule changes for ${submodule.name}`;
        const prBody = `# [${issueId}] Submodule changes\n\nThis PR contains changes to the ${submodule.name} submodule.`;

        const pr = await createDraftPr({
            client: githubClient,
            config: submoduleConfig,
            title: prTitle,
            body: prBody,
            head: branchName,
            base: baseBranch,
        });

        logger.info(`✅ Created draft PR: ${chalk.blue(pr.title)} (#${pr.number})`);
        logger.info(`🔗 PR URL: ${chalk.blueBright(chalk.underline(pr.html_url))}`);
    } catch (error) {
        logger.warn(`⚠️  Could not create PR for submodule ${chalk.cyan(submodule.name)}: ${(error as Error).message}`);
        logger.info(`ℹ️  You may need to create the PR manually`);
    }
}
