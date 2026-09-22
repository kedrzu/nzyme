import chalk from 'chalk';
import enquirer from 'enquirer';
import type { SimpleGit } from 'simple-git';
import { simpleGit } from 'simple-git';

import { UsageError } from '@nzyme/cli';
import type { Logger } from '@nzyme/logging/Logger.js';

import type { GithubConfig } from '../GithubConfig.js';
import { assertSubmoduleReady } from './assertSubmoduleReady.js';
import { checkoutBranch } from './checkoutBranch.js';
import type { GithubClient } from './createGithubClient.js';
import { decideDirtyCheckout } from './decideDirtyCheckout.js';
import { getSubmoduleGithubConfig } from './getSubmoduleGithubConfig.js';
import type { SubmoduleInfo } from './getSubmoduleInfo.js';
import { getSubmoduleInfo } from './getSubmoduleInfo.js';
import { handlePullWithRebase } from './handlePullWithRebase.js';
import { applyNamedStash, pushNamedStash } from './namedStash.js';
import { resolveSubmoduleBranch } from './resolveSubmoduleBranch.js';

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
     * The branch fast-forwarded in each submodule and, when a submodule's gitlink SHA resolves to
     * a base branch (see {@link baseBranches}), the one it is checked out onto (optional).
     */
    baseBranch?: string;

    /**
     * The caller project's base branches, used to classify a submodule's resolved branch and to
     * judge its readiness - see `assertSubmoduleReady`/`resolveSubmoduleBranch`. Supplied by the
     * caller: this package is generic and must never hardcode a project's own branch naming.
     * Required rather than defaulted: an empty list classifies every base branch as a task branch,
     * so a caller that omits it gets a checkout that refuses or resolves ambiguously - a silence
     * the type checker has to be able to catch.
     */
    baseBranches: string[];

    /**
     * Whether nobody is available to answer a question.
     * Uncommitted changes are then kept in place when the working tree is already on
     * {@link branchName}, and the checkout is refused otherwise - see {@link decideDirtyCheckout}.
     * A submodule that is not safe to move is likewise refused with a `UsageError` rather than
     * moved - see {@link checkoutSubmoduleBranch}.
     */
    unattended?: boolean;
}

/**
 * Parameters for checking out a submodule branch.
 */
interface CheckoutSubmoduleBranchParams {
    /**
     * The submodule to check out, as returned by `getSubmoduleInfo()`.
     */
    submodule: SubmoduleInfo;

    /**
     * GitHub client instance.
     */
    githubClient: GithubClient;

    /**
     * GitHub configuration of the main repository; the submodule's own is derived from it.
     */
    githubConfig: GithubConfig;

    /**
     * Logger instance.
     */
    logger: Logger;

    /**
     * See `CheckoutExistingBranchParams.baseBranch`.
     */
    baseBranch?: string;

    /**
     * See `CheckoutExistingBranchParams.baseBranches`.
     */
    baseBranches: string[];

    /**
     * See `CheckoutExistingBranchParams.unattended`.
     */
    unattended?: boolean;
}

/**
 * Checkout an existing branch, handling uncommitted changes by prompting the user.
 * Also handles checking out matching branches in submodules if GitHub client is provided.
 */
export async function checkoutExistingBranch(params: CheckoutExistingBranchParams): Promise<void> {
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
    const { logger, githubClient, githubConfig, baseBranch, baseBranches, unattended } = params;

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
                    githubClient,
                    githubConfig,
                    logger,
                    baseBranch,
                    baseBranches,
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
 * Checkout the branch a submodule's gitlink SHA resolves to, guarding it with
 * {@link assertSubmoduleReady} first. Also fetches and fast-forwards the base branch to keep it up
 * to date.
 */
async function checkoutSubmoduleBranch(params: CheckoutSubmoduleBranchParams): Promise<void> {
    const { submodule, githubClient, githubConfig, logger, baseBranch, baseBranches, unattended } = params;

    // Parse the submodule URL to get owner and repo
    const submoduleGithubConfig = getSubmoduleGithubConfig(submodule.url, githubConfig.token);
    if (!submoduleGithubConfig) {
        logger.info(
            `⏭️  Skipping submodule ${chalk.magenta(submodule.name)}: not a GitHub repository or could not parse URL`,
        );
        return;
    }

    const submoduleGit = simpleGit({ baseDir: submodule.path });
    const onBaseBranch = !submodule.detached && submodule.currentBranch === baseBranch;

    // `resolveSubmoduleBranch` below (and `assertSubmoduleReady`'s own detached-HEAD resolution)
    // runs `git branch -r --contains <sha>` over every remote-tracking ref, not only the base
    // branch fast-forwarded next - the target commit may sit on a task branch this checkout has
    // never fetched before. Only a full fetch guarantees it is visible.
    await submoduleGit.fetch('origin');

    // Skipped while already checked out on `baseBranch`: `update-ref` inside
    // `fetchAndFastForwardSubmoduleBaseBranch` moves the branch pointer without touching the
    // working tree, and moving the ref out from under the branch that is currently active would
    // desync HEAD from the checkout - `git status` would then read every file changed between the
    // two commits as an edit nobody made. `checkoutSubmoduleOntoBase` below brings this case up to
    // date safely instead, with a real merge that updates the working tree along with the ref.
    if (baseBranch && !onBaseBranch) {
        await fetchAndFastForwardSubmoduleBaseBranch(submoduleGit, submodule.name, baseBranch, logger);
    }

    // A submodule carrying uncommitted or unpushed work must never be moved out from under whoever
    // is mid-flight in it. Unattended this throws (a deliberate refusal the caller rethrows); with a
    // human present being mid-flight in a submodule is ordinary, so it is only reported and the
    // submodule is left exactly where it is - the same shape `judgeSubmodule` uses in `syncAllRepos`.
    try {
        await assertSubmoduleReady({ submodule, baseBranches, githubClient, githubConfig: submoduleGithubConfig });
    } catch (error) {
        if (unattended || !(error instanceof UsageError)) {
            throw error;
        }

        logger.warn(`⚠️  Submodule ${chalk.magenta(submodule.name)}: ${error.message}`);
        return;
    }

    // The main repo's checkout of `branchName` has already run by the time this executes, so the
    // gitlink it now records for the submodule - the commit HEAD points at right now - is the only
    // fact this repository actually carries about which submodule state belongs to the branch just
    // checked out. `rev-parse HEAD:<path>` reads that gitlink straight from the commit's tree, the
    // terser equivalent of `verify-submodule-refs.ts`'s `getSubmoduleCommit` (`ls-tree HEAD <path>`).
    const gitlinkSha = (await simpleGit().raw(['rev-parse', `HEAD:${submodule.path}`])).trim();

    const resolved = await resolveSubmoduleBranch({
        git: submoduleGit,
        sha: gitlinkSha,
        baseBranches,
        repoDisplayName: submodule.name,
    });

    if (resolved.kind === 'base') {
        await checkoutSubmoduleOntoBase({ submoduleGit, submodule, baseBranch, logger });
        return;
    }

    await checkoutSubmoduleOntoBranch({ submoduleGit, submodule, targetBranch: resolved.name, logger, unattended });
}

/**
 * Inputs to {@link checkoutSubmoduleOntoBase}.
 */
interface CheckoutSubmoduleOntoBaseParams {
    /**
     * Git instance scoped to the submodule working tree, with `origin` already fully fetched.
     */
    submoduleGit: SimpleGit;

    /**
     * The submodule being moved, as captured before this checkout began.
     */
    submodule: SubmoduleInfo;

    /**
     * The branch to park the submodule on. `undefined` only when the caller never supplied one, in
     * which case there is nowhere to move the submodule to.
     */
    baseBranch: string | undefined;

    /**
     * Logger instance.
     */
    logger: Logger;
}

/**
 * Move a submodule onto its base branch once its gitlink SHA has resolved there.
 *
 * Already on that branch, a real fast-forward-only merge is used instead of a plain checkout (a
 * no-op when already on the target) or a hard reset (destructive by construction): `assertSubmoduleReady`
 * already confirmed the branch carries no unpushed commits, so origin cannot be behind it, and
 * `--ff-only` fails loudly rather than fabricating a merge commit if that ever turns out false.
 * Anywhere else, an ordinary checkout is always safe - the previous branch keeps its own ref.
 */
async function checkoutSubmoduleOntoBase(params: CheckoutSubmoduleOntoBaseParams): Promise<void> {
    const { submoduleGit, submodule, baseBranch, logger } = params;
    const displayName = chalk.magenta(submodule.name);

    if (!baseBranch) {
        logger.info(`📝 Submodule ${displayName} belongs on a base branch, but none was supplied - leaving it as is`);
        return;
    }

    if (!submodule.detached && submodule.currentBranch === baseBranch) {
        try {
            await submoduleGit.raw(['merge', '--ff-only', `origin/${baseBranch}`]);
        } catch (error) {
            throw new Error(
                `Could not fast-forward submodule ${submodule.name} on ${baseBranch}: ${(error as Error).message}`,
                { cause: error },
            );
        }

        logger.info(`✅ Submodule ${displayName} is up to date on ${chalk.cyan(baseBranch)}`);
        return;
    }

    logger.info(`🔄 Checking out ${chalk.cyan(baseBranch)} in submodule ${displayName}...`);
    await checkoutLocalBranch(submoduleGit, baseBranch);
    logger.info(`✅ Submodule ${displayName} checked out on ${chalk.cyan(baseBranch)}`);
}

/**
 * Inputs to {@link checkoutSubmoduleOntoBranch}.
 */
interface CheckoutSubmoduleOntoBranchParams {
    /**
     * Git instance scoped to the submodule working tree, with `origin` already fully fetched.
     */
    submoduleGit: SimpleGit;

    /**
     * The submodule being moved, as captured before this checkout began.
     */
    submodule: SubmoduleInfo;

    /**
     * The non-base branch the submodule's gitlink SHA resolved to.
     */
    targetBranch: string;

    /**
     * Logger instance.
     */
    logger: Logger;

    /**
     * See `CheckoutExistingBranchParams.unattended`.
     */
    unattended?: boolean;
}

/**
 * Checkout the task branch a submodule's gitlink SHA resolved to, pulling in whatever origin has
 * gained since.
 */
async function checkoutSubmoduleOntoBranch(params: CheckoutSubmoduleOntoBranchParams): Promise<void> {
    const { submoduleGit, submodule, targetBranch, logger, unattended } = params;
    const displayName = chalk.magenta(submodule.name);

    // Check if already on the target branch
    if (submodule.currentBranch === targetBranch) {
        logger.info(`✅ Submodule ${displayName} is already on branch ${chalk.cyan(targetBranch)}`);
        return;
    }

    // Checkout the branch in the submodule
    logger.info(`🌿 Checking out branch ${chalk.cyan(targetBranch)} in submodule ${displayName}...`);

    let pullResult: Awaited<ReturnType<typeof handlePullWithRebase>>;

    try {
        // Checkout the task branch (origin already fetched in full by the caller)
        await checkoutLocalBranch(submoduleGit, targetBranch);

        // Pull the latest changes
        pullResult = await handlePullWithRebase({
            git: submoduleGit,
            remote: 'origin',
            branch: targetBranch,
            logger,
            contextMessage: `submodule ${displayName}`,
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

    logger.info(`✅ Checked out branch ${chalk.cyan(targetBranch)} in ${displayName}`);
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
