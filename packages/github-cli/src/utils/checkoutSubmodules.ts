import chalk from 'chalk';
import type { SimpleGit } from 'simple-git';
import { simpleGit } from 'simple-git';

import { UsageError } from '@nzyme/cli-core';
import type { Logger } from '@nzyme/logging/Logger.js';

import type { GithubConfig } from '../GithubConfig.js';
import { assertSubmoduleReady } from './assertSubmoduleReady.js';
import type { GithubClient } from './createGithubClient.js';
import { getSubmoduleGithubConfig } from './getSubmoduleGithubConfig.js';
import type { SubmoduleInfo } from './getSubmoduleInfo.js';
import { getSubmoduleInfo } from './getSubmoduleInfo.js';
import { handlePullWithRebase } from './handlePullWithRebase.js';
import type { SubmoduleBase } from './resolveSubmoduleBase.js';
import { describeSubmodulePin } from './resolveSubmoduleBase.js';
import { readGitlink } from './readGitlink.js';
import { resolveSubmoduleBranch } from './resolveSubmoduleBranch.js';

/**
 * Parameters for {@link checkoutSubmodules}.
 */
export interface CheckoutSubmodulesParams {
    /**
     * GitHub client of the main repository.
     */
    githubClient: GithubClient;

    /**
     * GitHub configuration of the main repository; each submodule's own is derived from it.
     */
    githubConfig: GithubConfig;

    /**
     * Logger instance.
     */
    logger: Logger;

    /**
     * What the submodules follow - see `resolveSubmoduleBase`. Following the trunk, each
     * submodule's trunk is fast-forwarded and a submodule whose gitlink SHA resolves onto it is
     * checked out there. Pinned, each submodule is checked out at exactly the commit the branch's
     * gitlink records, and no base is fast-forwarded. Either way its `trunk` is what a submodule's
     * branch is classified against while judging its readiness.
     */
    submoduleBase: SubmoduleBase;

    /**
     * Whether nobody is available to answer a question. A submodule that is not safe to move is
     * then refused with a `UsageError` rather than moved - see {@link checkoutSubmoduleBranch}.
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
     * See `CheckoutSubmodulesParams.submoduleBase`.
     */
    submoduleBase: SubmoduleBase;

    /**
     * See `CheckoutSubmodulesParams.unattended`.
     */
    unattended?: boolean;
}

/**
 * Check out, in every submodule, the branch the main repository's checked-out gitlink resolves to -
 * or the pinned commit itself when the submodules stay on their pin. Run right after the main
 * repository has been put on the branch, because the gitlink its HEAD records is what decides.
 */
export async function checkoutSubmodules(params: CheckoutSubmodulesParams): Promise<void> {
    const { logger, githubClient, githubConfig, submoduleBase, unattended } = params;

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

        if (submoduleBase.kind === 'pin') {
            logger.info(describeSubmodulePin(submoduleBase));
        }

        // Process each submodule
        for (const submodule of submodules) {
            try {
                await checkoutSubmoduleBranch({
                    submodule,
                    githubClient,
                    githubConfig,
                    logger,
                    submoduleBase,
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
 * {@link assertSubmoduleReady} first. Also fetches and fast-forwards the trunk to keep it up to
 * date. A pinned submodule is instead checked out at the gitlink SHA itself, and its trunk is left
 * as it is.
 */
async function checkoutSubmoduleBranch(params: CheckoutSubmoduleBranchParams): Promise<void> {
    const { submodule, githubClient, githubConfig, logger, submoduleBase, unattended } = params;
    const { trunk } = submoduleBase;

    // Parse the submodule URL to get owner and repo
    const submoduleGithubConfig = getSubmoduleGithubConfig(submodule.url, githubConfig.token);
    if (!submoduleGithubConfig) {
        logger.info(
            `⏭️  Skipping submodule ${chalk.magenta(submodule.name)}: not a GitHub repository or could not parse URL`,
        );
        return;
    }

    const submoduleGit = simpleGit({ baseDir: submodule.path });
    const onTrunk = !submodule.detached && submodule.currentBranch === trunk;

    // `resolveSubmoduleBranch` below (and `assertSubmoduleReady`'s own detached-HEAD resolution)
    // runs `git branch -r --contains <sha>` over every remote-tracking ref, not only the trunk
    // fast-forwarded next - the target commit may sit on a task branch this checkout has never
    // fetched before. Only a full fetch guarantees it is visible, and it is also what makes a pinned
    // commit available to check out. It moves remote-tracking refs only, never a branch.
    await submoduleGit.fetch('origin');

    // Skipped while already checked out on the trunk: `update-ref` inside
    // `fetchAndFastForwardSubmoduleBaseBranch` moves the branch pointer without touching the
    // working tree, and moving the ref out from under the branch that is currently active would
    // desync HEAD from the checkout - `git status` would then read every file changed between the
    // two commits as an edit nobody made. `checkoutSubmoduleOntoBase` below brings this case up to
    // date safely instead, with a real merge that updates the working tree along with the ref.
    // Skipped entirely while pinned: the submodule does not follow any base then.
    if (submoduleBase.kind === 'trunk' && !onTrunk) {
        await fetchAndFastForwardSubmoduleBaseBranch(submoduleGit, submodule.name, trunk, logger);
    }

    // A submodule carrying uncommitted or unpushed work must never be moved out from under whoever
    // is mid-flight in it. Unattended this throws (a deliberate refusal the caller rethrows); with a
    // human present being mid-flight in a submodule is ordinary, so it is only reported and the
    // submodule is left exactly where it is - the same shape `judgeSubmodule` uses in `syncAllRepos`.
    try {
        await assertSubmoduleReady({ submodule, trunk, githubClient, githubConfig: submoduleGithubConfig });
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
    // checked out.
    const gitlinkSha = await readGitlink(simpleGit(), submodule.path);

    if (submoduleBase.kind === 'pin') {
        await checkoutSubmoduleOntoPin({ submoduleGit, submodule, gitlinkSha, logger });
        return;
    }

    const resolved = await resolveSubmoduleBranch({
        git: submoduleGit,
        sha: gitlinkSha,
        trunk,
        repoDisplayName: submodule.name,
    });

    if (resolved.kind === 'base') {
        await checkoutSubmoduleOntoBase({ submoduleGit, submodule, baseBranch: trunk, logger });
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
     * The branch to park the submodule on — the trunk.
     */
    baseBranch: string;

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
 * Inputs to {@link checkoutSubmoduleOntoPin}.
 */
interface CheckoutSubmoduleOntoPinParams {
    /**
     * Git instance scoped to the submodule working tree, with `origin` already fully fetched.
     */
    submoduleGit: SimpleGit;

    /**
     * The submodule being moved, as captured before this checkout began.
     */
    submodule: SubmoduleInfo;

    /**
     * The commit the checked-out main-repository branch records for this submodule.
     */
    gitlinkSha: string;

    /**
     * Logger instance.
     */
    logger: Logger;
}

/**
 * Put a pinned submodule on exactly the commit its gitlink records — what `git submodule update`
 * does — so the branch builds what it pins and a later push has no moved gitlink to commit.
 *
 * Already on that commit, attached or not, it is left alone. Anywhere else a detached checkout is
 * safe: `assertSubmoduleReady` has already refused uncommitted or unpushed work, and the branch it
 * leaves keeps its own ref.
 */
async function checkoutSubmoduleOntoPin(params: CheckoutSubmoduleOntoPinParams): Promise<void> {
    const { submoduleGit, submodule, gitlinkSha, logger } = params;
    const displayName = chalk.magenta(submodule.name);
    const shortSha = gitlinkSha.slice(0, 7);

    if ((await submoduleGit.revparse(['HEAD'])).trim() === gitlinkSha) {
        logger.info(`✅ Submodule ${displayName} is on its pinned commit ${chalk.cyan(shortSha)}`);
        return;
    }

    logger.info(`📌 Checking out pinned commit ${chalk.cyan(shortSha)} in submodule ${displayName}...`);
    await submoduleGit.checkout(['--detach', gitlinkSha]);
    logger.info(`✅ Submodule ${displayName} is on its pinned commit ${chalk.cyan(shortSha)}`);
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
     * See `CheckoutSubmodulesParams.unattended`.
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
