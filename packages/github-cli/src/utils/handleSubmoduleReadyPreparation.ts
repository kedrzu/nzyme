import chalk from 'chalk';
import { simpleGit } from 'simple-git';

import { UsageError } from '@nzyme/cli';
import type { Logger } from '@nzyme/logging/Logger.js';

import type { GithubConfig } from '../GithubConfig.js';
import { determineNextVersion } from './branchVersionHelpers.js';
import type { GithubClient } from './createGithubClient.js';
import { ensureRepositoryReady } from './ensureRepositoryReady.js';
import { findAllMatchingPrs } from './findMatchingPr.js';
import { getCurrentBranch } from './getCurrentBranch.js';
import type { SubmoduleInfo } from './getSubmoduleInfo.js';
import { getSubmoduleInfo } from './getSubmoduleInfo.js';
import { isTaskBranch } from './isTaskBranch.js';

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
    let targetBranch = mainRepoBranch;
    let branchSwitchFailed = false;

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
            branchSwitchFailed = true;
            // Fallback to main repo branch if submodule current branch is undefined
            targetBranch = submodule.currentBranch || mainRepoBranch;
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
    // BUT: only check for the TARGET BRANCH that matches the main repo's branch
    // This prevents incorrectly switching to main when working on a versioned branch (e.g., --v2)
    logger.info(`🔍 Checking if submodule ${chalk.magenta(submodule.name)} PR was already merged...`);

    // Use the target branch (which should match main repo's branch) for the check
    // This ensures we only consider PRs merged for the EXACT version we're working on
    const currentSubmoduleBranch = targetBranch;

    // Find all PRs matching the issue ID and check if the TARGET branch has a merged PR
    const allMatchingPrs = await findAllMatchingPrs(githubClient, submoduleConfig, issueId);
    const currentBranchMergedPr = allMatchingPrs.find(pr => pr.head.ref === currentSubmoduleBranch && pr.merged_at);

    // If branch switch failed and we're on a different branch, we should NOT proceed with
    // the merged PR logic even if we find one, because we're not on the expected branch
    if (branchSwitchFailed && currentBranchMergedPr) {
        logger.info(
            `⚠️  Found merged PR for branch ${chalk.cyan(currentSubmoduleBranch)}, but submodule is on different branch`,
        );
        logger.info(`   Skipping merged PR handling and proceeding with normal workflow...`);

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

        // Update the submodule reference in the main repository
        logger.info(`🔄 Updating ${chalk.magenta(submodule.name)} reference in main repository...`);
        const mainGit = simpleGit();
        await mainGit.add(submodule.path);
        logger.info(`✅ Submodule ${chalk.magenta(submodule.name)} reference updated`);
        return;
    }

    if (currentBranchMergedPr && currentBranchMergedPr.base && currentBranchMergedPr.base.ref) {
        // The CURRENT BRANCH's PR is merged - proceed with version handling
        const mergedPr = currentBranchMergedPr;
        logger.info(`✅ Found merged PR: ${chalk.blue(mergedPr.title)} ${chalk.gray(`(#${mergedPr.number})`)}`);
        logger.info(`🎯 PR was merged to: ${chalk.cyan(mergedPr.base.ref)}`);

        // Check for uncommitted or unpushed changes before switching
        const status = await submoduleGit.status();
        const hasChanges = !status.isClean();
        const currentBranch = status.current;

        if (hasChanges) {
            // Submodule has uncommitted changes and PR is already merged - create a new versioned branch
            logger.info(
                `📝 Submodule ${chalk.magenta(submodule.name)} has uncommitted changes and PR is already merged`,
            );
            logger.info(`   PR ${chalk.gray(`#${mergedPr.number}`)} was merged to ${chalk.cyan(mergedPr.base.ref)}`);
            logger.info(`   Current branch: ${chalk.cyan(currentBranch || 'unknown')}`);
            logger.info('');
            logger.info(`🔄 Automatically creating new versioned branch for ${chalk.magenta(submodule.name)}...`);

            // Get all matching PRs to determine the next version
            const allMatchingPrs = await findAllMatchingPrs(githubClient, submoduleConfig, issueId);
            const allClosedPrs = allMatchingPrs.filter(pr => pr.merged_at || pr.state === 'closed');

            if (allClosedPrs.length === 0) {
                throw new UsageError(
                    `No closed PRs found for ${submodule.name} despite finding a merged PR. This should not happen.`,
                );
            }

            // Determine the new branch name with incremented version
            const allClosedBranches = allClosedPrs.map(pr => pr.head.ref);
            const latestBranchName = mergedPr.head.ref;
            const newBranchName = determineNextVersion(latestBranchName, allClosedBranches);

            logger.info(`🌿 Creating new versioned branch in submodule: ${chalk.cyan(newBranchName)}`);

            // Fetch latest changes first
            await submoduleGit.fetch('origin');

            // Check if the new branch already exists (for idempotency)
            const branches = await submoduleGit.branchLocal();
            const branchExists = branches.all.includes(newBranchName);

            if (branchExists) {
                // Branch already exists - check it out if not already on it
                if (currentBranch !== newBranchName) {
                    logger.info(`ℹ️  Branch ${chalk.cyan(newBranchName)} already exists, checking it out...`);
                    await submoduleGit.checkout(newBranchName);
                    logger.info(
                        `✅ Checked out existing branch ${chalk.cyan(newBranchName)} in ${chalk.magenta(submodule.name)}`,
                    );
                } else {
                    logger.info(
                        `ℹ️  Already on branch ${chalk.cyan(newBranchName)} in ${chalk.magenta(submodule.name)}`,
                    );
                }
            } else {
                // Create new branch from base branch and preserve uncommitted changes
                try {
                    // Stash uncommitted changes before switching branches
                    logger.info(`📦 Stashing uncommitted changes in ${chalk.magenta(submodule.name)}...`);
                    await submoduleGit.stash(['push', '-u', '-m', 'Temporary stash for branch version creation']);

                    // Create new branch from base
                    await submoduleGit.checkout(['-b', newBranchName, `origin/${mergedPr.base.ref}`]);
                    logger.info(`✅ Created branch ${chalk.cyan(newBranchName)} in ${chalk.magenta(submodule.name)}`);

                    // Apply stashed changes to the new branch
                    logger.info(`📦 Applying stashed changes to new branch...`);
                    try {
                        await submoduleGit.stash(['pop']);
                        logger.info(`✅ Applied stashed changes in ${chalk.magenta(submodule.name)}`);
                    } catch (stashError) {
                        logger.error(
                            `❌ Failed to apply stashed changes in ${chalk.magenta(submodule.name)}: ${(stashError as Error).message}`,
                        );
                        logger.error(
                            `   You may need to manually resolve conflicts in ${chalk.yellow(submodule.path)}`,
                        );
                        throw stashError;
                    }
                } catch (error) {
                    logger.error(
                        `❌ Failed to create new branch in ${chalk.magenta(submodule.name)}: ${(error as Error).message}`,
                    );
                    throw error;
                }
            }

            // Now continue with the normal flow to commit, push, and create PR
            await ensureRepositoryReady({
                githubClient,
                githubConfig: submoduleConfig,
                issueId,
                logger,
                baseBranch: mergedPr.base.ref,
                git: submoduleGit,
                repoDisplayName: chalk.magenta(submodule.name),
                generatePrTitle: () => `Submodule changes for ${submodule.name}`,
                generatePrBody: (id: string) =>
                    `# [${id}] Submodule changes\n\nThis PR contains changes to the ${submodule.name} submodule.`,
                defaultCommitMessage: `[${issueId}] Submodule changes`,
                autoYes,
                promptForPrTitle: true,
            });
        } else {
            // No uncommitted changes and PR is merged - switch to target branch
            const targetBranch = mergedPr.base.ref;
            logger.info(
                `🔄 Switching submodule ${chalk.magenta(submodule.name)} to target branch: ${chalk.cyan(targetBranch)}`,
            );

            try {
                // Fetch latest changes for the target branch
                logger.info(
                    `🔄 Fetching latest changes for ${chalk.cyan(targetBranch)} in ${chalk.magenta(submodule.name)}`,
                );
                await submoduleGit.fetch('origin', targetBranch);

                // Fast-forward the local target branch to match origin (without checking out)
                // This ensures the local branch points to the latest commit before we switch to it
                const branches = await submoduleGit.branchLocal();
                if (branches.all.includes(targetBranch)) {
                    logger.info(`🔄 Fast-forwarding ${chalk.cyan(targetBranch)} to latest`);
                    try {
                        await submoduleGit.raw([
                            'update-ref',
                            `refs/heads/${targetBranch}`,
                            `refs/remotes/origin/${targetBranch}`,
                        ]);
                        logger.info(`✅ Fast-forwarded ${chalk.cyan(targetBranch)} to latest`);
                    } catch (updateRefError) {
                        logger.warn(
                            `⚠️  Could not fast-forward ${chalk.cyan(targetBranch)}: ${(updateRefError as Error).message}`,
                        );
                    }
                }

                // Check if we're already on the target branch
                if (currentBranch !== targetBranch) {
                    // Switch to target branch
                    if (branches.all.includes(targetBranch)) {
                        await submoduleGit.checkout(targetBranch);
                    } else {
                        // Branch doesn't exist locally, create it from origin
                        await submoduleGit.checkout(['-b', targetBranch, `origin/${targetBranch}`]);
                    }
                }

                logger.info(
                    `✅ Switched ${chalk.magenta(submodule.name)} to ${chalk.cyan(targetBranch)} at latest commit`,
                );
            } catch (error) {
                logger.error(
                    `❌ Failed to switch ${chalk.magenta(submodule.name)} to target branch: ${(error as Error).message}`,
                );
                throw error;
            }
        }
    } else {
        // No merged PR found for the CURRENT BRANCH - continue with normal flow
        // (Note: there may be merged PRs for other versions, but not for this branch)
        if (allMatchingPrs.some(pr => pr.merged_at)) {
            logger.info(
                `📝 No merged PR found for current branch ${chalk.cyan(currentSubmoduleBranch || 'unknown')} in ${chalk.magenta(submodule.name)}`,
            );
            logger.info(`   (Found merged PRs for other versions, but continuing with current branch)`);
        } else {
            logger.info(
                `📝 No merged PR found for ${chalk.magenta(submodule.name)}, continuing with normal workflow...`,
            );
        }

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

