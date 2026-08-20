import chalk from 'chalk';
import { simpleGit } from 'simple-git';

import type { Logger } from '@nzyme/logging/Logger.js';

import { countCommits } from './countCommits.js';
import { ensureLocalBranch } from './ensureLocalBranch.js';

/**
 * Parameters for {@link syncStackNodesFromRemote}.
 */
export interface SyncStackNodesFromRemoteParams {
    /**
     * Node branches ordered bottom to top.
     */
    branches: string[];

    /**
     * Logger instance.
     */
    logger: Logger;
}

/**
 * Adopt the remote's version of every stack node whose local branch is stale.
 *
 * A stack gets rewritten on the server: merging a lower pull request re-targets and rebases the ones
 * above it, and the "Rebase stack" button does the same on demand. The local branches then describe
 * commits that no longer exist upstream, and the ordinary sync — which rebases local work onto the
 * remote and pushes — would replay those dead commits straight back on top.
 *
 * A node with no unpushed work of its own is simply reset to the remote. A node that does have local
 * commits — or, for the checked-out node, an uncommitted working tree — is left alone and reported,
 * because discarding unpushed work is never the right thing to do quietly. Callers are expected to
 * auto-commit first; the working-tree check is the last line of defence in front of a `reset --hard`.
 */
export async function syncStackNodesFromRemote(params: SyncStackNodesFromRemoteParams): Promise<void> {
    const { branches, logger } = params;

    const git = simpleGit({ config: ['submodule.recurse=false'] });
    const currentBranch = (await git.status()).current;

    logger.info('');
    logger.info(chalk.bold('🧱 Syncing stack nodes with the remote...'));

    await git.fetch('origin');

    for (const branch of branches) {
        const remoteRef = `origin/${branch}`;

        // A node nobody checked out here has no local branch to compare against, which is the
        // ordinary state for every node above the checked-out one.
        await ensureLocalBranch(git, branch);

        const [localAhead, remoteAhead] = await Promise.all([
            countCommits(git, `${remoteRef}..${branch}`),
            countCommits(git, `${branch}..${remoteRef}`),
        ]);

        if (remoteAhead === 0) {
            logger.info(`   ${chalk.cyan(branch)}: up to date with the remote`);
            continue;
        }

        if (localAhead > 0) {
            logger.warn(
                `   ⚠️  ${chalk.cyan(branch)} has ${chalk.yellow(localAhead.toString())} unpushed commit${
                    localAhead === 1 ? '' : 's'
                } and the remote moved — leaving it alone. ` + `Push or rebase it yourself before merging the stack.`,
            );
            continue;
        }

        if (branch === currentBranch) {
            const dirtyFiles = await countDirtyFiles(git);

            if (dirtyFiles > 0) {
                logger.warn(
                    `   ⚠️  ${chalk.cyan(branch)} has ${chalk.yellow(dirtyFiles.toString())} uncommitted change${
                        dirtyFiles === 1 ? '' : 's'
                    } and the remote moved — leaving it alone. ` + `Commit them before adopting the remote's history.`,
                );
                continue;
            }

            await git.raw(['reset', '--hard', remoteRef]);
        } else {
            // No checkout needed to move a branch that is not the one in the working tree.
            await git.raw(['update-ref', `refs/heads/${branch}`, `refs/remotes/origin/${branch}`]);
        }

        logger.info(
            `   ${chalk.green('✓')} ${chalk.cyan(branch)}: adopted the remote's ${chalk.yellow(remoteAhead.toString())} commit${
                remoteAhead === 1 ? '' : 's'
            }`,
        );
    }
}

/**
 * Count the tracked files a `reset --hard` would overwrite.
 *
 * Scoped to exactly what the reset destroys: untracked files survive it, and a submodule whose own
 * working tree is dirty is not the outer repository's uncommitted work — counting either would
 * refuse the reset over content that was never at risk.
 */
async function countDirtyFiles(git: ReturnType<typeof simpleGit>): Promise<number> {
    const status = await git.raw(['status', '--porcelain', '--untracked-files=no', '--ignore-submodules=all']);

    return status.split('\n').filter(line => line.trim().length > 0).length;
}
