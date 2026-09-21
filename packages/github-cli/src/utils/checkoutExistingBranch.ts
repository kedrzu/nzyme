import chalk from 'chalk';
import enquirer from 'enquirer';
import { simpleGit } from 'simple-git';

import { UsageError } from '@nzyme/cli';
import type { Logger } from '@nzyme/logging/Logger.js';

import type { GithubConfig } from '../GithubConfig.js';
import { checkoutBranch } from './checkoutBranch.js';
import type { GithubClient } from './createGithubClient.js';
import { findMatchingPr } from './findMatchingPr.js';
import { decideDirtyCheckout } from './decideDirtyCheckout.js';
import { getSubmoduleGithubConfig } from './getSubmoduleGithubConfig.js';
import { getSubmoduleInfo } from './getSubmoduleInfo.js';
import { handlePullWithRebase } from './handlePullWithRebase.js';
import { applyNamedStash, pushNamedStash } from './namedStash.js';

/**
 * Parameters for checking out an existing branch.
 */
export interface CheckoutExistingBranchParams {
    /**
     * The branch name to checkout.
     */
    branchName: string;

    /**
     * The task ID (e.g., "ABC-123").
     */
    taskId: string;

    /**
     * Logger instance.
     */
    logger: Logger;

    /**
     * GitHub client instance (optional, but recommended for submodule support).
     */
    githubClient?: GithubClient;

    /**
     * GitHub configuration (optional, but required if githubClient is provided).
     */
    githubConfig?: GithubConfig;

    /**
     * The base branch to use for submodules without PRs (optional).
     * When a submodule doesn't have a PR for the task, it will be updated to the latest commit on this branch.
     */
    baseBranch?: string;

    /**
     * Whether nobody is available to answer a question.
     * Uncommitted changes are then kept in place when the working tree is already on
     * {@link branchName}, and the checkout is refused otherwise - see {@link decideDirtyCheckout}.
     */
    unattended?: boolean;
}

/**
 * Parameters for checking out a submodule branch.
 */
interface CheckoutSubmoduleBranchParams {
    submodule: Awaited<ReturnType<typeof getSubmoduleInfo>>[0];
    taskId: string;
    mainBranchName: string;
    githubClient: GithubClient;
    githubConfig: GithubConfig;
    logger: Logger;
    baseBranch?: string;
    unattended?: boolean;
}

/**
 * Checkout an existing branch, handling uncommitted changes by prompting the user.
 * Also handles checking out matching branches in submodules if GitHub client is provided.
 */
export async function checkoutExistingBranch(
    branchNameOrParams: string | CheckoutExistingBranchParams,
    taskId?: string,
    logger?: Logger,
): Promise<void> {
    // Support both old signature (for backward compatibility) and new params object
    const params: CheckoutExistingBranchParams =
        typeof branchNameOrParams === 'string'
            ? { branchName: branchNameOrParams, taskId: taskId!, logger: logger! }
            : branchNameOrParams;

    const { branchName, logger: paramLogger, unattended } = params;
    const git = simpleGit();

    try {
        // Check if there are uncommitted changes
        const status = await git.status();
        const hasChanges = status.files.length > 0;

        if (!hasChanges) {
            // No uncommitted changes, checkout normally
            await checkoutBranch(branchName, paramLogger, unattended);
            await checkoutSubmodules(params);
            return;
        }

        // Show what changes exist
        const changeTypes: string[] = [];
        if (status.modified.length > 0) {
            changeTypes.push(`${status.modified.length} modified`);
        }
        if (status.staged.length > 0) {
            changeTypes.push(`${status.staged.length} staged`);
        }
        if (status.not_added.length > 0) {
            changeTypes.push(`${status.not_added.length} untracked`);
        }
        if (status.deleted.length > 0) {
            changeTypes.push(`${status.deleted.length} deleted`);
        }
        if (status.created.length > 0) {
            changeTypes.push(`${status.created.length} created`);
        }
        if (status.renamed.length > 0) {
            changeTypes.push(`${status.renamed.length} renamed`);
        }

        paramLogger.info(`⚠️  You have uncommitted changes: ${chalk.yellow(changeTypes.join(', '))}`);

        // `status` already knows which branch we are on, so deciding this costs no extra git call.
        const decision = decideDirtyCheckout({
            currentBranch: status.current,
            targetBranch: branchName,
            interactive: process.stdin.isTTY,
            unattended,
        });

        if (decision === 'refuse') {
            throw new UsageError(
                `Refusing to switch from ${status.current ?? 'a detached HEAD'} to ${branchName} with uncommitted ` +
                    `changes, because doing so can carry them onto ${branchName} unnoticed. ` +
                    `Commit or discard them first.`,
            );
        }

        if (decision === 'proceed') {
            paramLogger.info(`✅ Already on ${chalk.cyan(branchName)} - keeping the uncommitted changes in place`);
            await checkoutBranch(branchName, paramLogger, unattended);
            await checkoutSubmodules(params);
            return;
        }

        // Ask user what to do with uncommitted changes
        const { action } = await enquirer.prompt<{ action: string }>({
            type: 'select',
            name: 'action',
            message: `How do you want to handle uncommitted changes when switching to ${chalk.cyan(branchName)}?`,
            choices: [
                {
                    name: 'stash',
                    message: `${chalk.green('Stash changes')} and reapply them after checkout`,
                    value: 'stash',
                },
                {
                    name: 'checkout',
                    message: `${chalk.yellow('Try to checkout as is')} (may fail if there are conflicts)`,
                    value: 'checkout',
                },
                {
                    name: 'cancel',
                    message: `${chalk.red('Cancel')} - I'll handle the changes manually`,
                    value: 'cancel',
                },
            ],
        });

        switch (action) {
            case 'checkout': {
                // Try to checkout directly - git will handle conflicts
                paramLogger.info(`🔄 Attempting to checkout ${chalk.cyan(branchName)} with uncommitted changes...`);
                await checkoutBranch(branchName, paramLogger, unattended);
                paramLogger.info(`✅ Successfully checked out ${chalk.cyan(branchName)} with uncommitted changes`);
                await checkoutSubmodules(params);
                break;
            }

            case 'stash': {
                // Stash changes, checkout, then reapply.
                const stash = await pushNamedStash(git, `task-${params.taskId}-existing-branch`, paramLogger);

                // Checkout the branch
                await checkoutBranch(branchName, paramLogger, unattended);

                // Checkout submodules before reapplying stash
                await checkoutSubmodules(params);

                // Absent when the entry could not be re-identified after the push - then it stays on
                // the shared stack, because applying something we cannot name unambiguously is the
                // one thing that stack makes unsafe. `pushNamedStash` already said how to recover it.
                if (stash) {
                    await applyNamedStash(git, stash, paramLogger);
                }

                break;
            }

            case 'cancel': {
                throw new UsageError(
                    'Operation canceled by user. Please handle your uncommitted changes and try again.',
                );
            }

            default: {
                throw new UsageError(`Unknown action: ${action}`);
            }
        }
    } catch (error) {
        if (error instanceof UsageError) {
            // Already says what went wrong and what resolves it - wrapping it would bury that.
            throw error;
        }

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new UsageError(`Failed to checkout branch ${branchName}: ${errorMessage}`);
    }
}

/**
 * Checkout matching branches in submodules if they exist.
 */
async function checkoutSubmodules(params: CheckoutExistingBranchParams): Promise<void> {
    const { branchName, taskId, logger, githubClient, githubConfig, baseBranch, unattended } = params;

    // Only process submodules if GitHub client and config are provided
    if (!githubClient || !githubConfig) {
        return;
    }

    try {
        logger.info('🔍 Checking for submodules...');
        const submodules = await getSubmoduleInfo();

        if (submodules.length === 0) {
            logger.info('✅ No submodules found in repository');
            return;
        }

        logger.info(
            `📦 Found ${chalk.yellow(submodules.length.toString())} submodule${submodules.length === 1 ? '' : 's'}`,
        );

        // Process each submodule
        for (const submodule of submodules) {
            try {
                await checkoutSubmoduleBranch({
                    submodule,
                    taskId,
                    mainBranchName: branchName,
                    githubClient,
                    githubConfig,
                    logger,
                    baseBranch,
                    unattended,
                });
            } catch (error) {
                if (error instanceof UsageError) {
                    // A deliberate refusal - the submodule was left untouched on purpose and the caller
                    // has to decide. Degrading it to a warning would let the run continue into the sync
                    // step, which rebases the submodule anyway - exactly what the refusal prevents.
                    throw error;
                }

                // Log warning but continue with other submodules
                logger.warn(
                    `⚠️  Failed to checkout branch in submodule ${chalk.magenta(submodule.name)}: ${(error as Error).message}`,
                );
                logger.info(`ℹ️  Continuing with remaining submodules...`);
            }
        }

        logger.info('✅ Finished processing submodules');
    } catch (error) {
        if (error instanceof UsageError) {
            // Refusal from the loop above - must not be swallowed here either.
            throw error;
        }

        // Log warning but don't fail the entire operation
        logger.warn(`⚠️  Could not process submodules: ${(error as Error).message}`);
    }
}

/**
 * Checkout a matching branch in a specific submodule.
 * Also fetches and fast-forwards the base branch to keep it up to date.
 */
async function checkoutSubmoduleBranch(params: CheckoutSubmoduleBranchParams): Promise<void> {
    const { submodule, taskId, githubClient, githubConfig, logger, baseBranch, unattended } = params;

    // Parse the submodule URL to get owner and repo
    const submoduleGithubConfig = getSubmoduleGithubConfig(submodule.url, githubConfig.token);
    if (!submoduleGithubConfig) {
        logger.info(
            `⏭️  Skipping submodule ${chalk.magenta(submodule.name)}: not a GitHub repository or could not parse URL`,
        );
        return;
    }

    const submoduleGit = simpleGit({ baseDir: submodule.path });

    // Fetch and fast-forward the base branch in this submodule
    if (baseBranch) {
        await fetchAndFastForwardSubmoduleBaseBranch(submoduleGit, submodule.name, baseBranch, logger);
    }

    // Find if there's a PR for this task in the submodule
    logger.info(`🔍 Looking for PR in submodule ${chalk.magenta(submodule.name)}...`);
    const pr = await findMatchingPr(githubClient, submoduleGithubConfig, taskId);

    if (!pr) {
        logger.info(`📝 No PR found for task ${chalk.bold(taskId)} in submodule ${chalk.magenta(submodule.name)}`);

        // Checkout the base branch (already fetched and FF'd above)
        if (baseBranch) {
            // The reset below is `--hard`, so uncommitted work here would be gone for good: it sits in
            // no commit and no stash. Dirty means somebody is mid-change in this submodule - leave it
            // exactly where it is. Reachable without a human since `unattended` skips the prompt.
            const submoduleStatus = await submoduleGit.status();
            if (submoduleStatus.files.length > 0) {
                logger.warn(
                    `⚠️  Submodule ${chalk.magenta(submodule.name)} has uncommitted changes - keeping them in ` +
                        `place instead of resetting it to ${chalk.cyan(baseBranch)}. Commit or discard them and ` +
                        `run the command again to update the submodule.`,
                );
                return;
            }

            try {
                logger.info(
                    `🔄 Checking out ${chalk.cyan(baseBranch)} in submodule ${chalk.magenta(submodule.name)}...`,
                );
                await checkoutLocalBranch(submoduleGit, baseBranch);
                // Reset working tree to match the ref updated by fetchAndFastForwardSubmoduleBaseBranch.
                // update-ref only moves the branch pointer without touching the working tree,
                // and checkout is a no-op when already on the branch, so we need an explicit reset.
                await submoduleGit.reset(['--hard', `refs/heads/${baseBranch}`]);
                logger.info(
                    `✅ Submodule ${chalk.magenta(submodule.name)} updated to latest commit on ${chalk.cyan(baseBranch)}`,
                );
            } catch (error) {
                logger.warn(
                    `⚠️  Could not checkout ${chalk.cyan(baseBranch)} in submodule ${chalk.magenta(submodule.name)}: ${(error as Error).message}`,
                );
            }
        }

        return;
    }

    const targetBranch = pr.head.ref;

    // Check if already on the target branch
    if (submodule.currentBranch === targetBranch) {
        logger.info(`✅ Submodule ${chalk.magenta(submodule.name)} is already on branch ${chalk.cyan(targetBranch)}`);
        return;
    }

    // Checkout the branch in the submodule
    logger.info(`🌿 Checking out branch ${chalk.cyan(targetBranch)} in submodule ${chalk.magenta(submodule.name)}...`);

    let pullResult: Awaited<ReturnType<typeof handlePullWithRebase>>;

    try {
        // Fetch latest changes for the task branch from origin
        await submoduleGit.fetch('origin', targetBranch);

        // Checkout the task branch
        await checkoutLocalBranch(submoduleGit, targetBranch);

        // Pull the latest changes
        pullResult = await handlePullWithRebase({
            git: submoduleGit,
            remote: 'origin',
            branch: targetBranch,
            logger,
            contextMessage: `submodule ${chalk.magenta(submodule.name)}`,
            unattended,
        });
    } catch (error) {
        // A plain Error, not a UsageError: the caller degrades an operational failure in one submodule
        // to a warning and moves on. UsageError out of this function means a deliberate refusal.
        throw new Error(
            `Failed to checkout branch ${targetBranch} in submodule ${submodule.name}: ${(error as Error).message}`,
            { cause: error },
        );
    }

    // Outside the try on purpose: a refusal is a decision, not a failure, so it must reach the caller
    // as a UsageError rather than be re-wrapped and walked past.
    if (pullResult.cancelled) {
        throw new UsageError(
            `${targetBranch} in submodule ${submodule.name} has diverged from origin and was not rebased. ` +
                `Reconcile it there (git pull --rebase) and run the command again.`,
        );
    }

    logger.info(`✅ Checked out branch ${chalk.cyan(targetBranch)} in ${chalk.magenta(submodule.name)}`);
}

/**
 * Fetch and fast-forward a base branch in a submodule without checking it out.
 * Verifies the operation is a true fast-forward using merge-base --is-ancestor
 * to avoid silently orphaning local commits on a diverged branch.
 */
async function fetchAndFastForwardSubmoduleBaseBranch(
    git: ReturnType<typeof simpleGit>,
    submoduleName: string,
    baseBranch: string,
    logger: Logger,
): Promise<void> {
    try {
        logger.info(`🔄 Fetching ${chalk.cyan(baseBranch)} in submodule ${chalk.magenta(submoduleName)}...`);
        await git.fetch('origin', baseBranch);

        const localRef = `refs/heads/${baseBranch}`;
        const remoteRef = `refs/remotes/origin/${baseBranch}`;

        // Check if the local branch exists before verifying ancestry
        const localBranchExists = await git
            .raw(['rev-parse', '--verify', localRef])
            .then(() => true)
            .catch(() => false);

        if (localBranchExists) {
            // Verify that the local branch is an ancestor of the remote —
            // i.e. the update is actually a fast-forward.
            try {
                await git.raw(['merge-base', '--is-ancestor', localRef, remoteRef]);
            } catch {
                logger.warn(
                    `⚠️  Local branch ${chalk.cyan(baseBranch)} in ${chalk.magenta(submoduleName)} has diverged from origin. Skipping fast-forward to avoid losing local commits.`,
                );
                return;
            }
        }

        await git.raw(['update-ref', localRef, remoteRef]);
        logger.info(`✅ Fast-forwarded ${chalk.cyan(baseBranch)} in ${chalk.magenta(submoduleName)}`);
    } catch (error) {
        logger.warn(
            `⚠️  Could not fetch/fast-forward ${chalk.cyan(baseBranch)} in ${chalk.magenta(submoduleName)}: ${(error as Error).message}`,
        );
    }
}

/**
 * Checkout a branch locally, creating it from origin if it doesn't exist.
 */
async function checkoutLocalBranch(git: ReturnType<typeof simpleGit>, branch: string): Promise<void> {
    const branches = await git.branchLocal();

    if (branches.all.includes(branch)) {
        await git.checkout(branch);
    } else {
        try {
            await git.checkoutBranch(branch, `origin/${branch}`);
        } catch {
            await git.checkout(branch);
        }
    }
}
