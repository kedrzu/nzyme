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
