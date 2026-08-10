import chalk from 'chalk';
import { simpleGit } from 'simple-git';

import type { Logger } from '@nzyme/logging/Logger.js';

import { assertNoConflicts } from './assertNoConflicts.js';
import { handleMergeConflict } from './handleMergeConflict.js';

/**
 * Parameters for {@link cascadeRebaseStack}.
 */
export interface CascadeRebaseStackParams {
    /**
     * Node branches ordered bottom to top. The first entry is the base every other node builds on
     * and is never rebased here.
     */
    branches: string[];

    /**
     * Logger instance.
     */
    logger: Logger;
}

/**
 * Replay each node of a stack onto the one below it, so the chain is linear again.
 *
 * GitHub re-targets and rebases the remaining pull requests by itself when a lower one *merges*, but
 * not when a lower branch simply gains a commit — after amending a lower node, or after re-pointing
 * a submodule gitlink, the nodes above still carry the old parent. Merging in that state would
 * squash each node against a base it never saw and quietly revert the change.
 *
 * Done locally because there is no API for it: GitHub's published OpenAPI description exposes four
 * stack routes (`/stacks`, `/stacks/{n}`, `/stacks/{n}/add`, `/stacks/{n}/unstack`) and none of them
 * rebases. The server-side cascade is reachable only from the **Rebase stack** button in the merge
 * box, and the CLI equivalent is `gh stack rebase`. Doing it with git here also keeps the commits
 * under whatever signature configuration the machine has, and surfaces a conflict in a working tree
 * the caller can actually resolve it in.
 */
export async function cascadeRebaseStack(params: CascadeRebaseStackParams): Promise<void> {
    const { branches, logger } = params;

    if (branches.length < 2) {
        return;
    }

    // Submodule recursion off for the same reason as syncAllRepos: git would otherwise try to fetch
    // gitlink commits by SHA while replaying, which real remotes reject.
    const git = simpleGit({ config: ['submodule.recurse=false'] });
    const originalBranch = (await git.status()).current;

    logger.info('');
    logger.info(chalk.bold('🧱 Restacking nodes onto their parents...'));

    await git.fetch('origin');

    try {
        for (let index = 1; index < branches.length; index++) {
            const parentBranch = branches[index - 1]!;
            const nodeBranch = branches[index]!;

            const behind = await countCommitsMissing(git, nodeBranch, parentBranch);
            if (behind === 0) {
                logger.info(`   ${chalk.cyan(nodeBranch)}: already on top of ${chalk.cyan(parentBranch)}`);
                continue;
            }

            logger.info(
                `   ${chalk.cyan(nodeBranch)}: replaying onto ${chalk.cyan(parentBranch)} ` +
                    `(${chalk.yellow(behind.toString())} commit${behind === 1 ? '' : 's'} behind)...`,
            );

            await git.checkout(nodeBranch);

            try {
                await git.rebase([parentBranch]);
            } catch (error) {
                await handleMergeConflict({ git, repoDisplayName: nodeBranch, operation: 'rebase', logger }, error);
            }

            await assertNoConflicts({ git, repoDisplayName: nodeBranch, operation: 'rebase', logger });

            // Lease rather than a blind force: if someone pushed to this node while we were working,
            // the push fails instead of discarding their commit.
            await git.push('origin', nodeBranch, { '--force-with-lease': null });
            logger.info(`   ${chalk.green('✓')} Restacked and pushed ${chalk.cyan(nodeBranch)}`);
        }
    } finally {
        if (originalBranch) {
            await git.checkout(originalBranch);
        }
    }
}

/**
 * Count commits present in `ancestor` but missing from `branch` — zero means the branch already
 * builds on the current tip of its parent.
 */
async function countCommitsMissing(
    git: ReturnType<typeof simpleGit>,
    branch: string,
    ancestor: string,
): Promise<number> {
    try {
        const result = await git.raw(['rev-list', '--count', `${branch}..${ancestor}`]);
        return parseInt(result.trim(), 10);
    } catch {
        return 0;
    }
}
