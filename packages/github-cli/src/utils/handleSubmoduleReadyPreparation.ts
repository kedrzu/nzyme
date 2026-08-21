import chalk from 'chalk';
import { simpleGit } from 'simple-git';

import { UsageError } from '@nzyme/cli';
import type { Logger } from '@nzyme/logging/Logger.js';

import type { GithubConfig } from '../GithubConfig.js';
import { determineNextVersion, stripNodeSuffix } from './branchVersionHelpers.js';
import type { GithubClient } from './createGithubClient.js';
import { ensureRepositoryReady } from './ensureRepositoryReady.js';
import { findAllMatchingPrs } from './findMatchingPr.js';
import { getCurrentBranch } from './getCurrentBranch.js';
import type { SubmoduleInfo } from './getSubmoduleInfo.js';
import { getSubmoduleGithubConfig } from './getSubmoduleGithubConfig.js';
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
     * Branch the submodule should track — the main repository's branch with any stack-node suffix
     * removed, so every node of a chain converges on one submodule branch.
     */
    taskBranch: string;

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
    const { githubClient, githubConfig, issueId, logger, baseBranch, autoYes } = params;

    const submodules = await getSubmoduleInfo();

    if (submodules.length === 0) {
        return;
    }

    // Filter submodules that:
    // 1. Have changes or unpushed commits, OR
    // 2. Are on a task branch (to ensure PR exists even if previous creation failed)
    const submodulesToProcess = submodules.filter(
        sub => sub.hasChanges || sub.unpushedCommitsCount > 0 || isTaskBranch(sub.currentBranch),
    );

    if (submodulesToProcess.length === 0) {
        return;
    }

    logger.info('');
    logger.info(chalk.bold('📦 Processing submodules...'));

    for (const submodule of submodulesToProcess) {
        const details: string[] = [];
        if (submodule.hasChanges) {
            details.push('uncommitted changes');
        }
        if (submodule.unpushedCommitsCount > 0) {
            details.push(
                `${submodule.unpushedCommitsCount} unpushed commit${submodule.unpushedCommitsCount === 1 ? '' : 's'}`,
            );
        }
        if (!submodule.hasChanges && submodule.unpushedCommitsCount === 0 && isTaskBranch(submodule.currentBranch)) {
            details.push(`on task branch ${chalk.cyan(submodule.currentBranch)}`);
        }
        logger.info(`   ${chalk.magenta(submodule.name)}: ${details.join(', ')}`);
    }

    // The submodule tracks the TASK's branch, not the node's. A stacked task's main branch carries a
    // `--sN` suffix; reusing it verbatim here forks a second submodule branch at the same commit as
    // the first, and the PR that would be opened for it has no commits between head and base. A
    // submodule has one branch and one pull request per task, whatever shape the chain above it has.
    const taskBranch = stripNodeSuffix(await getCurrentBranch());

    // Process each submodule
    for (const submodule of submodulesToProcess) {
        await handleSingleSubmodule({
            submodule,
            githubClient,
            githubConfig,
            issueId,
            logger,
            baseBranch,
            taskBranch,
            autoYes,
        });
    }
}

async function handleSingleSubmodule(params: HandleSingleSubmoduleParams): Promise<void> {
    const { submodule, githubClient, githubConfig, issueId, logger, baseBranch, taskBranch, autoYes } = params;

    const submoduleGit = simpleGit({ baseDir: submodule.path });
    const subName = chalk.magenta(submodule.name);

    // Ensure we're on the correct branch (the task's, shared by every node of a stack)
    let targetBranch = taskBranch;
    let branchSwitchFailed = false;

    if (submodule.currentBranch !== taskBranch) {
        try {
            const branches = await submoduleGit.branchLocal();

            if (branches.all.includes(taskBranch)) {
                await submoduleGit.checkout(taskBranch);
            } else {
                await submoduleGit.checkoutLocalBranch(taskBranch);
            }
            logger.info(`   ${subName}: checked out ${chalk.cyan(taskBranch)}`);
        } catch (error) {
            logger.warn(`   ${subName}: could not checkout ${chalk.cyan(taskBranch)}: ${(error as Error).message}`);
            logger.info(`   ${subName}: continuing with ${chalk.cyan(submodule.currentBranch || 'unknown')}`);
            branchSwitchFailed = true;
            targetBranch = submodule.currentBranch || taskBranch;
        }
    }

    // Parse the submodule URL to get owner and repo for GitHub config
    const submoduleConfig = getSubmoduleGithubConfig(submodule.url, githubConfig.token);
    if (!submoduleConfig) {
        const errorMessage = `Could not parse GitHub URL for submodule: ${submodule.url}`;
        logger.error(`   ${subName}: ${errorMessage}`);
        throw new UsageError(errorMessage);
    }

    // Check if the submodule PR was already merged
    const currentSubmoduleBranch = targetBranch;

    const allMatchingPrs = await findAllMatchingPrs(githubClient, submoduleConfig, issueId);
    const currentBranchMergedPr = allMatchingPrs.find(pr => pr.head.ref === currentSubmoduleBranch && pr.merged_at);

    // If branch switch failed and we're on a different branch, skip merged PR handling
    if (branchSwitchFailed && currentBranchMergedPr) {
        logger.info(
            `   ${subName}: merged PR found for ${chalk.cyan(currentSubmoduleBranch)}, but on different branch`,
        );

        await ensureRepositoryReady({
            githubClient,
            githubConfig: submoduleConfig,
            issueId,
            logger,
            baseBranch,
            git: submoduleGit,
            repoDisplayName: submodule.name,
            generatePrTitle: () => `Submodule changes for ${submodule.name}`,
            generatePrBody: (id: string) =>
                `# [${id}] Submodule changes\n\nThis PR contains changes to the ${submodule.name} submodule.`,
            defaultCommitMessage: `[${issueId}] Submodule changes`,
            autoYes,
            promptForPrTitle: true,
        });

        await updateSubmoduleReference(submodule, logger);
        return;
    }

    if (currentBranchMergedPr && currentBranchMergedPr.base && currentBranchMergedPr.base.ref) {
        await handleMergedPr(params, submoduleGit, submoduleConfig, currentBranchMergedPr, allMatchingPrs);
    } else {
        if (allMatchingPrs.some(pr => pr.merged_at)) {
            logger.info(
                `   ${subName}: no merged PR for ${chalk.cyan(currentSubmoduleBranch || 'unknown')} (other versions merged)`,
            );
        }

        await ensureRepositoryReady({
            githubClient,
            githubConfig: submoduleConfig,
            issueId,
            logger,
            baseBranch,
            git: submoduleGit,
            repoDisplayName: submodule.name,
            generatePrTitle: () => `Submodule changes for ${submodule.name}`,
            generatePrBody: (id: string) =>
                `# [${id}] Submodule changes\n\nThis PR contains changes to the ${submodule.name} submodule.`,
            defaultCommitMessage: `[${issueId}] Submodule changes`,
            autoYes,
            promptForPrTitle: true,
        });
    }

    await updateSubmoduleReference(submodule, logger);
}

async function handleMergedPr(
    params: HandleSingleSubmoduleParams,
    submoduleGit: ReturnType<typeof simpleGit>,
    submoduleConfig: GithubConfig,
    mergedPr: { title: string; number: number; head: { ref: string }; base: { ref: string }; merged_at: string | null },
    allMatchingPrs: Array<{ head: { ref: string }; state: string; merged_at: string | null }>,
): Promise<void> {
    const { submodule, githubClient, issueId, logger, autoYes } = params;
    const subName = chalk.magenta(submodule.name);

    logger.info(
        `   ${subName}: PR merged - ${chalk.blue(mergedPr.title)} ${chalk.gray(`#${mergedPr.number}`)} → ${chalk.cyan(mergedPr.base.ref)}`,
    );

    const status = await submoduleGit.status();
    const hasChanges = !status.isClean();
    const currentBranch = status.current;

    if (hasChanges) {
        // Create a new versioned branch for additional changes
        const allClosedPrs = allMatchingPrs.filter(pr => pr.merged_at || pr.state === 'closed');

        if (allClosedPrs.length === 0) {
            throw new UsageError(
                `No closed PRs found for ${submodule.name} despite finding a merged PR. This should not happen.`,
            );
        }

        const allClosedBranches = allClosedPrs.map(pr => pr.head.ref);
        const newBranchName = determineNextVersion(mergedPr.head.ref, allClosedBranches);

        logger.info(`   ${subName}: creating versioned branch ${chalk.cyan(newBranchName)}...`);

        await submoduleGit.fetch('origin');

        const branches = await submoduleGit.branchLocal();
        const branchExists = branches.all.includes(newBranchName);

        if (branchExists) {
            if (currentBranch !== newBranchName) {
                await submoduleGit.checkout(newBranchName);
            }
            logger.info(`   ${chalk.green('✓')} Checked out ${chalk.cyan(newBranchName)} in ${subName}`);
        } else {
            try {
                await submoduleGit.stash(['push', '-u', '-m', 'Temporary stash for branch version creation']);
                await submoduleGit.checkout(['-b', newBranchName, `origin/${mergedPr.base.ref}`]);

                try {
                    await submoduleGit.stash(['pop']);
                } catch (stashError) {
                    logger.error(`   ${subName}: failed to apply stashed changes: ${(stashError as Error).message}`);
                    logger.error(`   You may need to manually resolve conflicts in ${chalk.yellow(submodule.path)}`);
                    throw stashError;
                }
            } catch (error) {
                if (!(error instanceof Error && error.message.includes('stash'))) {
                    logger.error(`   ${subName}: failed to create branch: ${(error as Error).message}`);
                }
                throw error;
            }
            logger.info(`   ${chalk.green('✓')} Created ${chalk.cyan(newBranchName)} in ${subName}`);
        }

        await ensureRepositoryReady({
            githubClient,
            githubConfig: submoduleConfig,
            issueId,
            logger,
            baseBranch: mergedPr.base.ref,
            git: submoduleGit,
            repoDisplayName: submodule.name,
            generatePrTitle: () => `Submodule changes for ${submodule.name}`,
            generatePrBody: (id: string) =>
                `# [${id}] Submodule changes\n\nThis PR contains changes to the ${submodule.name} submodule.`,
            defaultCommitMessage: `[${issueId}] Submodule changes`,
            autoYes,
            promptForPrTitle: true,
        });
    } else {
        // No changes, switch to the target branch the PR was merged to
        const targetBranch = mergedPr.base.ref;

        try {
            await submoduleGit.fetch('origin', targetBranch);

            const branches = await submoduleGit.branchLocal();
            if (branches.all.includes(targetBranch)) {
                try {
                    await submoduleGit.raw([
                        'update-ref',
                        `refs/heads/${targetBranch}`,
                        `refs/remotes/origin/${targetBranch}`,
                    ]);
                } catch {
                    // Ignore fast-forward failure
                }
            }

            if (currentBranch !== targetBranch) {
                if (branches.all.includes(targetBranch)) {
                    await submoduleGit.checkout(targetBranch);
                } else {
                    await submoduleGit.checkout(['-b', targetBranch, `origin/${targetBranch}`]);
                }
            }

            logger.info(`   ${chalk.green('✓')} Switched ${subName} to ${chalk.cyan(targetBranch)}`);
        } catch (error) {
            logger.error(`   ${subName}: failed to switch to ${chalk.cyan(targetBranch)}: ${(error as Error).message}`);
            throw error;
        }
    }
}

async function updateSubmoduleReference(submodule: SubmoduleInfo, logger: Logger): Promise<void> {
    const mainGit = simpleGit();
    await mainGit.add(submodule.path);
    logger.info(`   ${chalk.green('✓')} Updated ${chalk.magenta(submodule.name)} reference in main repository`);
}
