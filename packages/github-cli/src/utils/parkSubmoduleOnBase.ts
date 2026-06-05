import chalk from 'chalk';
import type { SimpleGit } from 'simple-git';

import { UsageError } from '@nzyme/cli';
import type { Logger } from '@nzyme/logging/Logger.js';

/**
 * Parameters for {@link parkSubmoduleOnBase}.
 */
export interface ParkSubmoduleOnBaseParams {
    /**
     * Git instance for the submodule working tree.
     */
    git: SimpleGit;

    /**
     * Base branch to park the submodule on (e.g. 'main').
     */
    baseBranch: string;

    /**
     * Logger instance.
     */
    logger: Logger;

    /**
     * Display name of the submodule (for log messages).
     */
    repoDisplayName: string;
}

/**
 * Reset a submodule working tree onto the tip of its (already-fetched-then-fetched) base branch.
 *
 * Called **after** the submodule's PR has been squash-merged. A squash merge produces a brand-new
 * commit on the base branch with no ancestry link to the task-branch commits, so the previously
 * checked-out task tip is NOT an ancestor of `origin/<base>` — the containment guard used pre-merge
 * (see {@link switchDetachedSubmoduleToBaseBranch}) would wrongly refuse here. Post-merge the squash
 * commit is the authoritative successor and the task work is already preserved on base, so we move
 * onto `origin/<base>` unconditionally.
 *
 * The only thing worth protecting is work that is NOT yet merged: this aborts (never discards) when
 * the working tree is dirty or the local base branch has unpushed commits.
 */
export async function parkSubmoduleOnBase(params: ParkSubmoduleOnBaseParams): Promise<void> {
    const { git, baseBranch, logger, repoDisplayName } = params;

    try {
        await git.fetch('origin', baseBranch);
    } catch {
        // Remote branch should exist (we just merged into it); fall through to the explicit check below.
    }

    if (!(await hasRemoteRef(git, baseBranch))) {
        throw new UsageError(
            `Cannot park ${repoDisplayName} on ${baseBranch}: origin/${baseBranch} not found after fetch.`,
        );
    }

    const status = await git.status();
    if (status.files.length > 0) {
        throw new UsageError(
            `Submodule ${repoDisplayName} has uncommitted changes — refusing to reset it onto ${baseBranch}. ` +
                `Commit or stash them and try again.`,
        );
    }

    if (await hasUnpushedBaseCommits(git, baseBranch)) {
        throw new UsageError(
            `Submodule ${repoDisplayName} has a local ${baseBranch} ahead of origin/${baseBranch} ` +
                `(unpushed commits) — refusing to reset it. Push or remove them and try again.`,
        );
    }

    // Final guard before the force-reset: protect commits reachable only from the current HEAD.
    // The checks above only cover the working tree and the local base branch — they do NOT see
    // commits that live solely under a detached HEAD (or a non-base current branch tip). If HEAD
    // points at work that is neither already on origin/<base> NOR pushed to any remote branch, the
    // `checkout -B` below would orphan it with no ref (recoverable only via reflog) = silent loss.
    //
    // The legitimate post-squash-merge case still passes: the task tip is not an ancestor of
    // origin/<base> (squash breaks ancestry), but the original task branch is pushed, so HEAD is
    // contained in a remote-tracking branch and this guard does not fire.
    if (!(await isContainedIn(git, 'HEAD', `origin/${baseBranch}`)) && !(await isOnAnyRemoteBranch(git, 'HEAD'))) {
        throw new UsageError(
            `Submodule ${repoDisplayName} has commits on its current HEAD that are not on ` +
                `origin/${baseBranch} and not pushed to any remote branch — refusing to reset it onto ` +
                `${baseBranch} (those commits would be lost). Push or branch them and try again.`,
        );
    }

    await git.checkout(['-B', baseBranch, `origin/${baseBranch}`]);
    logger.info(`   ${chalk.green('✓')} Parked ${repoDisplayName} on ${chalk.cyan(baseBranch)}`);
}

/**
 * Whether `refs/remotes/origin/<branch>` exists locally.
 */
async function hasRemoteRef(git: SimpleGit, branch: string): Promise<boolean> {
    try {
        await git.raw(['show-ref', '--verify', '--quiet', `refs/remotes/origin/${branch}`]);
        return true;
    } catch {
        return false;
    }
}

/**
 * Whether a local base branch exists and is ahead of its remote (has unpushed commits).
 */
async function hasUnpushedBaseCommits(git: SimpleGit, branch: string): Promise<boolean> {
    try {
        await git.raw(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]);
    } catch {
        // No local base branch — nothing to protect.
        return false;
    }

    try {
        const result = await git.raw(['rev-list', '--count', `origin/${branch}..${branch}`]);
        return parseInt(result.trim(), 10) > 0;
    } catch {
        return false;
    }
}

/**
 * Whether `commit` is contained in `ref`, i.e. it is an ancestor of (or equal to) it.
 * Uses a rev-list count instead of `merge-base --is-ancestor`, whose exit-1 ("not an ancestor")
 * is silently swallowed by simple-git and would otherwise read as success.
 */
async function isContainedIn(git: SimpleGit, commit: string, ref: string): Promise<boolean> {
    try {
        const out = await git.raw(['rev-list', '--count', `${ref}..${commit}`]);
        return parseInt(out.trim(), 10) === 0;
    } catch {
        return false;
    }
}

/**
 * Whether `commit` is reachable from at least one remote-tracking branch (`refs/remotes/*`).
 * Used to confirm that work on the current HEAD is safely pushed before a force-reset that would
 * otherwise orphan it. `git branch -r --contains` lists the remote branches containing the commit,
 * so a non-empty result means the commit is preserved on some remote.
 */
async function isOnAnyRemoteBranch(git: SimpleGit, commit: string): Promise<boolean> {
    try {
        const out = await git.raw(['branch', '-r', '--contains', commit]);
        return out.trim().length > 0;
    } catch {
        return false;
    }
}
