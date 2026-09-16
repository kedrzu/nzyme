import chalk from 'chalk';
import { simpleGit } from 'simple-git';

import type { Logger } from '@nzyme/logging/Logger.js';

import type { NamedStash } from './namedStash.js';
import { applyNamedStash, pushNamedStash } from './namedStash.js';

/**
 * Result of branch selection operation.
 */
export interface BranchSelectionResult {
    /**
     * The selected base branch to start from.
     */
    selectedBaseBranch: string;

    /**
     * The stash holding the uncommitted changes, if there were any. Absent when nothing was
     * stashed, and also when the entry could not be re-identified after the push - in which case
     * it stays on the stack for the human, because applying something we cannot name is exactly
     * what the shared stack makes unsafe.
     */
    stash?: NamedStash;

    /**
     * The point to start the new branch from (e.g. origin/main).
     */
    startPoint?: string;
}

/**
 * Parameters for branch selection.
 */
export interface BranchSelectionParams {
    /**
     * The base branch to start the new branch from (e.g. 'main').
     * New task branches always start from the up-to-date remote tip of this branch,
     * regardless of the currently checked-out branch.
     */
    branch: string;

    /**
     * Task/issue ID for stashing.
     */
    taskId: string;

    /**
     * Logger instance.
     */
    logger: Logger;
}

/**
 * Prepare the starting point for a new task branch.
 *
 * Always branches from the up-to-date remote tip of the given base branch
 * (e.g. `origin/main`) rather than the currently checked-out branch, stashing
 * any uncommitted changes first so they can be re-applied on the new branch.
 */
export async function handleBranchSelection(params: BranchSelectionParams): Promise<BranchSelectionResult> {
    const { branch, taskId, logger } = params;

    logger.info(`🌿 Starting new branch from: ${chalk.cyan(branch)}`);

    const git = simpleGit();

    // Stash uncommitted changes before switching branches so nothing is lost.
    const status = await git.status();
    const hasChanges = status.files.length > 0;

    const stash = hasChanges ? await pushNamedStash(git, `task-${taskId}-${branch}`, logger) : undefined;

    // Fetch the base branch so the new branch is cut from an up-to-date remote tip.
    logger.info(`🔄 Fetching latest changes for ${chalk.cyan(branch)}`);
    await git.fetch('origin', branch);

    return {
        selectedBaseBranch: branch,
        stash,
        startPoint: `origin/${branch}`,
    };
}

/**
 * Apply changes stashed by {@link handleBranchSelection}, in the same repository root it stashed
 * them from.
 */
export async function applyStashedChanges(stash: NamedStash, logger: Logger): Promise<void> {
    await applyNamedStash(simpleGit(), stash, logger);
}
