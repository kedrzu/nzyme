import chalk from 'chalk';
import { simpleGit } from 'simple-git';

import { UsageError } from '@nzyme/cli';
import type { Logger } from '@nzyme/logging';

import type { GithubConfig } from '../GithubConfig.js';
import type { GithubClient } from './createGithubClient.js';
import { ensureRepositoryReady } from './ensureRepositoryReady.js';
import { findMergedPr } from './findMatchingPr.js';
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

    /**
     * Whether to skip submodule processing.
     */
    skipSubmodules?: boolean;

    /**
     * Whether to skip prompts and automatically commit with default message.
     */
    autoYes?: boolean;
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

    /**
     * Whether to skip prompts and automatically commit with default message.
     */
    autoYes?: boolean;
}

/**
 * Handle submodule preparation before marking a PR as ready.
 * This checks for changes in submodules and handles committing/pushing/creating PRs as needed.
 * Updates submodule references in the main repository (which should be committed separately).
 */
export async function handleSubmoduleReadyPreparation(params: HandleSubmoduleReadyPreparationParams): Promise<void> {
    const { githubClient, githubConfig, issueId, logger, baseBranch, skipSubmodules, autoYes } = params;

    if (skipSubmodules) {
        logger.info('⏭️  Skipping submodule processing (--skip-submodules flag)');
        return;
    }

    logger.info('🔍 Checking for submodule changes...');
    const submodules = await getSubmoduleInfo();

    if (submodules.length === 0) {
        logger.info('✅ No submodules found in repository');
        return;
    }

    // Filter submodules that:
    // 1. Have changes or unpushed commits, OR
    // 2. Are on a task branch (to ensure PR exists even if previous creation failed)
    const submodulesToProcess = submodules.filter(
        sub => sub.hasChanges || sub.unpushedCommitsCount > 0 || isTaskBranch(sub.currentBranch),
    );

    if (submodulesToProcess.length === 0) {
        logger.info('✅ No submodules to process');
        return;
    }

    logger.info(
        `⚠️  Found ${chalk.yellow(submodulesToProcess.length.toString())} submodule${
            submodulesToProcess.length === 1 ? '' : 's'
        } to process:`,
    );

    for (const submodule of submodulesToProcess) {
        logger.info(`   • ${chalk.cyan(submodule.name)} (${submodule.path})`);
        if (submodule.hasChanges) {
            logger.info(`     - Uncommitted changes`);
        }
        if (submodule.unpushedCommitsCount > 0) {
            logger.info(
                `     - ${submodule.unpushedCommitsCount} unpushed commit${submodule.unpushedCommitsCount === 1 ? '' : 's'}`,
            );
        }
        if (!submodule.hasChanges && submodule.unpushedCommitsCount === 0 && isTaskBranch(submodule.currentBranch)) {
            logger.info(`     - On task branch ${chalk.cyan(submodule.currentBranch)} (checking PR status)`);
        }
    }

    // Get the current branch name from main repo to use as template
    const mainRepoBranch = await getCurrentBranch();

    // Process each submodule
    for (const submodule of submodulesToProcess) {
        logger.info('');
        logger.info(`📦 ${chalk.bold('Processing submodule:')} ${chalk.bold.magenta(submodule.name)}`);

        await handleSingleSubmodule({
            submodule,
            githubClient,
            githubConfig,
            issueId,
            logger,
            baseBranch,
            mainRepoBranch,
            autoYes,
        });
    }

    logger.info('');
    logger.info('✅ All submodules processed');
    logger.info('ℹ️  Submodule references have been updated in the main repository');
}

async function handleSingleSubmodule(params: HandleSingleSubmoduleParams): Promise<void> {
    const { submodule, githubClient, githubConfig, issueId, logger, baseBranch, mainRepoBranch, autoYes } = params;

    const submoduleGit = simpleGit({ baseDir: submodule.path });

    // Ensure we're on the correct branch (same as main repo if possible)
    if (submodule.currentBranch !== mainRepoBranch) {
        try {
            logger.info(
                `🌿 Checking out branch ${chalk.cyan(mainRepoBranch)} in submodule ${chalk.magenta(submodule.name)}...`,
            );
            const branches = await submoduleGit.branchLocal();

            if (branches.all.includes(mainRepoBranch)) {
                await submoduleGit.checkout(mainRepoBranch);
            } else {
                // Branch doesn't exist, create it from current branch
                await submoduleGit.checkoutLocalBranch(mainRepoBranch);
            }
            logger.info(`✅ Checked out branch ${chalk.cyan(mainRepoBranch)} in ${chalk.magenta(submodule.name)}`);
        } catch (error) {
            logger.warn(
                `⚠️  Could not checkout branch ${chalk.cyan(mainRepoBranch)} in ${chalk.magenta(submodule.name)}: ${(error as Error).message}`,
            );
            logger.info(
                `ℹ️  Continuing with current branch: ${chalk.cyan(submodule.currentBranch || 'unknown')} in ${chalk.magenta(submodule.name)}`,
            );
        }
    }

    // Parse the submodule URL to get owner and repo for GitHub config
    const urlMatch = submodule.url.match(/github\.com[:/]([^/]+)\/(.+?)(\.git)?$/);
    if (!urlMatch) {
        const errorMessage = `Could not parse GitHub URL for submodule: ${submodule.url}`;
        logger.error(`❌ ${errorMessage}`);
        throw new UsageError(errorMessage);
    }

    const [, owner, repo] = urlMatch;
    if (!owner || !repo) {
        const errorMessage = `Could not extract owner/repo from URL: ${submodule.url}`;
        logger.error(`❌ ${errorMessage}`);
        throw new UsageError(errorMessage);
    }

    const submoduleConfig: GithubConfig = {
        owner,
        repo: repo.replace(/\.git$/, ''),
        token: githubConfig.token,
    };

    // Check if the submodule PR was already merged
    logger.info(`🔍 Checking if submodule ${chalk.magenta(submodule.name)} PR was already merged...`);
    const mergedPr = await findMergedPr(githubClient, submoduleConfig, issueId);

    if (mergedPr && mergedPr.base && mergedPr.base.ref) {
        logger.info(`✅ Found merged PR: ${chalk.blue(mergedPr.title)} ${chalk.gray(`(#${mergedPr.number})`)}`);
        logger.info(`🎯 PR was merged to: ${chalk.cyan(mergedPr.base.ref)}`);

        // Check for uncommitted or unpushed changes before switching
        const status = await submoduleGit.status();
        const hasChanges = !status.isClean();
        const currentBranch = status.current;

        if (hasChanges) {
            logger.error(
                `❌ Submodule ${chalk.magenta(submodule.name)} has uncommitted changes but PR is already merged!`,
            );
            logger.error(`   PR ${chalk.gray(`#${mergedPr.number}`)} was merged to ${chalk.cyan(mergedPr.base.ref)}`);
            logger.error(`   Current branch: ${chalk.cyan(currentBranch || 'unknown')}`);
            logger.error('');
            logger.error('🔧 To fix this:');
            logger.error(`   1. Review the uncommitted changes in ${chalk.yellow(submodule.path)}`);
            logger.error(`   2. Either commit them to a new branch or discard them`);
            logger.error(`   3. Then run this command again`);
            throw new UsageError(
                `Submodule ${submodule.name} has uncommitted changes but PR #${mergedPr.number} is already merged. Please resolve manually.`,
            );
        }

        // No uncommitted changes and PR is merged - switch to target branch
        const targetBranch = mergedPr.base.ref;
        logger.info(
            `🔄 Switching submodule ${chalk.magenta(submodule.name)} to target branch: ${chalk.cyan(targetBranch)}`,
        );

        try {
            // Fetch latest changes
            await submoduleGit.fetch('origin');

            // Check if we're already on the target branch
            if (currentBranch !== targetBranch) {
                // Switch to target branch
                const branches = await submoduleGit.branchLocal();
                if (branches.all.includes(targetBranch)) {
                    await submoduleGit.checkout(targetBranch);
                } else {
                    // Branch doesn't exist locally, create it from origin
                    await submoduleGit.checkout(['-b', targetBranch, `origin/${targetBranch}`]);
                }
            }

            // Pull latest changes
            await submoduleGit.pull('origin', targetBranch);
            logger.info(
                `✅ Switched ${chalk.magenta(submodule.name)} to ${chalk.cyan(targetBranch)} and pulled latest changes`,
            );
        } catch (error) {
            logger.error(
                `❌ Failed to switch ${chalk.magenta(submodule.name)} to target branch: ${(error as Error).message}`,
            );
            throw error;
        }
    } else {
        // No merged PR found - continue with normal flow
        logger.info(`📝 No merged PR found for ${chalk.magenta(submodule.name)}, continuing with normal workflow...`);

        // Use the unified ensureRepositoryReady function to handle commits, push, and PR creation
        await ensureRepositoryReady({
            githubClient,
            githubConfig: submoduleConfig,
            issueId,
            logger,
            baseBranch,
            git: submoduleGit,
            repoDisplayName: chalk.magenta(submodule.name),
            generatePrTitle: () => `Submodule changes for ${submodule.name}`,
            generatePrBody: (id: string) =>
                `# [${id}] Submodule changes\n\nThis PR contains changes to the ${submodule.name} submodule.`,
            defaultCommitMessage: `[${issueId}] Submodule changes`,
            autoYes,
            promptForPrTitle: true,
        });
    }

    // Update the submodule reference in the main repository
    logger.info(`🔄 Updating ${chalk.magenta(submodule.name)} reference in main repository...`);
    const mainGit = simpleGit();
    await mainGit.add(submodule.path);
    logger.info(`✅ Submodule ${chalk.magenta(submodule.name)} reference updated`);
}

/**
 * Check if a branch name appears to be a task/issue branch.
 */
function isTaskBranch(branchName: string | undefined): boolean {
    if (!branchName) {
        return false;
    }

    // Check for common task branch patterns:
    // - feature/SIG-123-... or feature/sig-123-...
    // - bug/SIG-123-... or bug/sig-123-...
    // - SIG-123-... or sig-123-...
    // - Any branch containing task IDs like SIG-123, PROJ-456, etc. (case-insensitive)
    const taskIdPattern = /[A-Z]+-\d+/i;
    return taskIdPattern.test(branchName);
}
