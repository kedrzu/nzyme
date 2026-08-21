import chalk from 'chalk';
import { simpleGit } from 'simple-git';

import type { Logger } from '@nzyme/logging/Logger.js';

import { assertNoConflicts } from './assertNoConflicts.js';
import { countCommits } from './countCommits.js';
import { ensureLocalBranch } from './ensureLocalBranch.js';
import { GitMergeConflictError } from './GitMergeConflictError.js';
import { handleMergeConflict } from './handleMergeConflict.js';
import { pushWithUpstream } from './pushWithUpstream.js';

/**
 * Parameters for {@link cascadeStack}.
 */
export interface CascadeStackParams {
    /**
     * Node branches ordered bottom to top. The first entry is the base every other node builds on
     * and is never touched here.
     */
    branches: string[];

    /**
     * Logger instance.
     */
    logger: Logger;
}

/**
 * Carry each node's changes up to the node above it, so the whole chain is up to date again.
 *
 * GitHub re-targets and rebases the remaining pull requests by itself when a lower one *merges*, but
 * not when a lower branch simply gains a commit — after refreshing the bottom node against the trunk,
 * after amending a lower node, or after re-pointing a submodule gitlink, the nodes above still build
 * on the old parent. Merging in that state would squash each node against a base it never saw and
 * quietly revert the change.
 *
 * The parent is **merged** into each child rather than the child being rebased onto the parent.
 * GitHub only asks that every branch have the tip of the layer below it in its history, which a
 * merge satisfies — and a merge needs no force-push, so review comments keep their anchors and
 * conflicts keep the ordinary ours/theirs meaning instead of the inverted one a rebase produces.
 * The merge commits themselves cost nothing: each pull request lands as a single squash commit.
 *
 * Idempotent: a node that already contains its parent's tip is skipped, so re-running after
 * resolving a conflict simply continues from where it stopped.
 *
 * @returns Each node branch this run pushed, mapped to the head SHA it pushed for it. That is the
 * commit a merge of that node would land, and the only thing that knows it: GitHub's PR object lags
 * a push by seconds and keeps reporting the pre-cascade head, so a caller gating on checks has to
 * pin them to this instead. A node left untouched is absent rather than reported at its local tip —
 * nothing here pushed it, so its local tip is no evidence of what the remote holds.
 */
export async function cascadeStack(params: CascadeStackParams): Promise<Map<string, string>> {
    const { branches, logger } = params;

    const pushedHeads = new Map<string, string>();

    if (branches.length < 2) {
        return pushedHeads;
    }

    // Submodule recursion off for the same reason as syncAllRepos: git would otherwise try to fetch
    // gitlink commits by SHA while merging, which real remotes reject.
    const git = simpleGit({ config: ['submodule.recurse=false'] });
    const originalBranch = (await git.status()).current;

    logger.info('');
    logger.info(chalk.bold('🧱 Carrying changes up the stack...'));

    try {
        for (let index = 1; index < branches.length; index++) {
            const parentBranch = branches[index - 1]!;
            const nodeBranch = branches[index]!;

            // A node above the one the worktree actually checked out has no local branch yet — its
            // branch was created remotely by `stackTask` and never materialised here. Ensuring both
            // sides exist locally before counting means the count below reflects their real history
            // instead of erroring on an absent ref, and the DWIM checkout further down always has a
            // remote-tracking branch to create from.
            await ensureLocalBranch(git, parentBranch);
            await ensureLocalBranch(git, nodeBranch);

            const behind = await countCommits(git, `${nodeBranch}..${parentBranch}`);
            if (behind === 0) {
                logger.info(`   ${chalk.cyan(nodeBranch)}: already up to date with ${chalk.cyan(parentBranch)}`);
                continue;
            }

            logger.info(
                `   ${chalk.cyan(nodeBranch)}: merging ${chalk.cyan(parentBranch)} ` +
                    `(${chalk.yellow(behind.toString())} commit${behind === 1 ? '' : 's'} behind)...`,
            );

            await git.checkout(nodeBranch);

            try {
                await git.merge([parentBranch]);
            } catch (error) {
                await rethrowWithStackPosition(
                    () => handleMergeConflict({ git, repoDisplayName: nodeBranch, operation: 'merge', logger }, error),
                    { nodeBranch, nodePosition: index + 1, nodeCount: branches.length, against: parentBranch },
                );
            }

            await rethrowWithStackPosition(
                () => assertNoConflicts({ git, repoDisplayName: nodeBranch, operation: 'merge', logger }),
                { nodeBranch, nodePosition: index + 1, nodeCount: branches.length, against: parentBranch },
            );

            await pushWithUpstream(git);
            pushedHeads.set(nodeBranch, await git.revparse([nodeBranch]));
            logger.info(`   ${chalk.green('✓')} Updated and pushed ${chalk.cyan(nodeBranch)}`);
        }
    } finally {
        // Going back is only right when the run finished. A conflict leaves the node checked out
        // mid-merge on purpose — that is where the resolution belongs — and git refuses to switch
        // away from an unresolved index anyway, so attempting it would replace the conflict report
        // with a far less useful "you need to resolve your current index first".
        const status = await git.status();
        if (originalBranch && status.current !== originalBranch && status.conflicted.length === 0) {
            await git.checkout(originalBranch);
        }
    }

    return pushedHeads;
}

/**
 * Run an operation that may throw {@link GitMergeConflictError} and re-throw it carrying the stack
 * position, so the caller can tell the user which node to fix instead of just which files broke.
 */
async function rethrowWithStackPosition(
    operation: () => Promise<unknown>,
    stackContext: NonNullable<GitMergeConflictError['stackContext']>,
): Promise<void> {
    try {
        await operation();
    } catch (error) {
        if (error instanceof GitMergeConflictError) {
            throw new GitMergeConflictError({
                repoDisplayName: error.repoDisplayName,
                conflictedFiles: error.conflictedFiles,
                operation: error.operation,
                stackContext,
            });
        }
        throw error;
    }
}
