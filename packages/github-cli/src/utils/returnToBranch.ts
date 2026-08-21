import chalk from 'chalk';
import { simpleGit } from 'simple-git';

import type { Logger } from '@nzyme/logging/Logger.js';

/**
 * Put the working tree back on the branch a command was invoked from.
 *
 * A command that moves across a stack's nodes owes the user their branch back: being left somewhere
 * else is a surprise, and being left on a node that has just been merged and deleted upstream is a
 * confusing one.
 *
 * Three cases are deliberately left where they are:
 *
 * - a tree left **mid-conflict**, because switching away would strand the resolution the user is
 *   about to make, and git refuses to leave an unresolved index anyway;
 * - a branch that no longer exists locally, which is not something to recreate here;
 * - a failed checkout — this runs in a `finally`, so throwing would replace whatever the command was
 *   actually reporting with a message about tidying up.
 */
export async function returnToBranch(branch: string | null | undefined, logger: Logger): Promise<void> {
    if (!branch) {
        return;
    }

    try {
        const git = simpleGit({ config: ['submodule.recurse=false'] });
        const status = await git.status();

        if (status.current === branch) {
            return;
        }

        if (status.conflicted.length > 0) {
            logger.info(
                `📍 Staying on ${chalk.cyan(status.current ?? 'the current branch')} — it has conflicts to resolve.`,
            );
            return;
        }

        const localBranches = await git.branchLocal();
        if (!localBranches.all.includes(branch)) {
            logger.info(`📍 Staying on ${chalk.cyan(status.current ?? 'the current branch')} — ${branch} is gone.`);
            return;
        }

        await git.checkout(branch);
        logger.info(`↩️  Back on ${chalk.cyan(branch)}`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`⚠️  Could not switch back to ${chalk.cyan(branch)}: ${message}`);
    }
}
