import chalk from 'chalk';
import type { SimpleGit } from 'simple-git';

import type { Logger } from '@nzyme/logging/Logger.js';

/**
 * Parameters for {@link switchDetachedSubmoduleToBaseBranch}.
 */
export interface SwitchDetachedSubmoduleToBaseBranchParams {
    /**
     * Git client scoped to the submodule working directory.
     */
    git: SimpleGit;

    /**
     * Base branch name the submodule should track (e.g. 'main').
     */
    baseBranch: string;

    /**
     * Logger instance.
     */
    logger: Logger;

    /**
     * Display name for log output (e.g. the submodule name).
     */
    repoDisplayName: string;
}

/**
 * Move a submodule that is in a detached HEAD state onto its base branch at the latest
 * remote commit.
 *
 * Why: superprojects pin submodules to a specific commit, so submodules are usually checked
 * out on a detached HEAD. When the superproject is later rebased/merged with upstream commits
 * that move the gitlink forward, git must perform a three-way merge of the submodule gitlink.
 * A detached, stale submodule trips this up and surfaces spurious "commits not present" /
 * "Merge conflict in <submodule>" errors even though nothing actually changed in the submodule.
 * Parking the submodule on a real, up-to-date branch keeps that gitlink merge a clean
 * fast-forward.
 *
 * Safety: this only switches when (a) the detached commit is already contained in `origin/<base>`,
 * i.e. the submodule merely tracks the base branch with no unpushed work that switching could
 * orphan, AND (b) any existing local base branch is itself fully contained in `origin/<base>`,
 * so resetting it to the remote tip discards nothing. If a local base branch carries unpushed
 * commits, the submodule is left detached rather than silently rewinding that branch. Anything
 * else is left untouched. The caller is expected to have fetched the submodule beforehand so
 * `origin/<base>` is up to date.
 *
 * @returns `true` if the submodule was switched onto the base branch, `false` if it was left as-is.
 */
export async function switchDetachedSubmoduleToBaseBranch(
    params: SwitchDetachedSubmoduleToBaseBranchParams,
): Promise<boolean> {
    const { git, baseBranch, logger, repoDisplayName } = params;
    const remoteBaseBranch = `origin/${baseBranch}`;

    // The base branch must exist on the submodule remote to switch onto it.
    if (!(await refExists(git, `refs/remotes/${remoteBaseBranch}`))) {
        logger.info(`   ${repoDisplayName}: detached HEAD, no ${chalk.cyan(baseBranch)} on remote — leaving as is`);
        return false;
    }

    // Only switch when the current (detached) commit is already part of the base branch.
    // Otherwise the submodule carries commits that switching away would orphan, so we leave it.
    if (!(await isContainedIn(git, 'HEAD', remoteBaseBranch))) {
        logger.warn(
            `   ⚠️  ${repoDisplayName}: detached HEAD has commits not on ${chalk.cyan(baseBranch)} — leaving detached`,
        );
        return false;
    }

    // `-B` below force-resets any existing local base branch to the remote tip. The detached-HEAD
    // check above only proves the current HEAD is safe — not that an existing local branch is. If a
    // local base branch exists with commits not on the remote (unpushed work), resetting it would
    // orphan them, so we leave the submodule detached instead.
    if (
        (await refExists(git, `refs/heads/${baseBranch}`)) &&
        !(await isContainedIn(git, baseBranch, remoteBaseBranch))
    ) {
        logger.warn(
            `   ⚠️  ${repoDisplayName}: local ${chalk.cyan(baseBranch)} has unpushed commits — leaving detached`,
        );
        return false;
    }

    // Create/reset the local base branch to the latest remote tip and check it out.
    // The working tree is clean, HEAD is an ancestor of the remote tip, and any existing local
    // base branch is fully contained in the remote, so this is a loss-free fast-forward.
    await git.checkout(['-B', baseBranch, remoteBaseBranch]);
    logger.info(
        `   ${chalk.green('✓')} ${repoDisplayName}: switched detached HEAD → ${chalk.cyan(baseBranch)} (latest)`,
    );
    return true;
}

/**
 * Check whether a git ref exists. Resolved via output rather than exit code: simple-git does
 * not reject on the exit-1 that these query commands use to signal "absent".
 */
async function refExists(git: SimpleGit, ref: string): Promise<boolean> {
    try {
        const out = await git.raw(['rev-parse', '--verify', '--quiet', ref]);
        return out.trim().length > 0;
    } catch {
        return false;
    }
}

/**
 * Check whether `commit` is contained in `branch`, i.e. it is an ancestor of (or equal to) it.
 * Uses a rev-list count instead of `merge-base --is-ancestor`, whose exit-1 ("not an ancestor")
 * is silently swallowed by simple-git and would otherwise read as success.
 */
async function isContainedIn(git: SimpleGit, commit: string, branch: string): Promise<boolean> {
    try {
        const out = await git.raw(['rev-list', '--count', `${branch}..${commit}`]);
        return Number.parseInt(out.trim(), 10) === 0;
    } catch {
        return false;
    }
}
