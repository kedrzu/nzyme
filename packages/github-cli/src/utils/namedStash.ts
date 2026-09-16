import chalk from 'chalk';
import type { SimpleGit } from 'simple-git';

import type { Logger } from '@nzyme/logging/Logger.js';
import { assertValue } from '@nzyme/utils/assert.js';

/**
 * A stash entry this process pushed, carrying both of the things that make it recoverable.
 */
export interface NamedStash {
    /**
     * The exact message the entry was pushed with, unique per push.
     */
    name: string;

    /**
     * The entry's SHA, captured right after the push. Restoring goes through this, never a
     * `stash@{n}` index.
     */
    sha: string;
}

/**
 * Stash the working tree under a unique, meaningful name and return what is needed to get it back.
 *
 * The stash stack is shared across every worktree of a clone and several agents work in parallel
 * worktrees, so an entry is only ever safe to touch when it can be identified unambiguously - by
 * name, never by position. See CLAUDE.md "Stash safety (multi-worktree)". The caller supplies the
 * meaningful half of the name; a timestamp and a random suffix make it unique, because a plain
 * per-task label collides whenever two worktrees work the same task at once.
 *
 * Returns undefined when the entry cannot be re-identified afterwards: the changes are stashed,
 * but nothing may be applied automatically, so the caller is told to recover them by hand.
 */
export async function pushNamedStash(git: SimpleGit, label: string, logger: Logger): Promise<NamedStash | undefined> {
    const name = `${label}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    logger.info(`📦 Stashing uncommitted changes as: ${chalk.cyan(name)}`);

    await git.stash(['push', '-u', '-m', name]);

    // Resolved by matching our own unique message, never by assuming `stash@{0}` - a sibling
    // worktree's push landing at the same instant would already have shifted it.
    const entry = await findUniqueStash(git, name);

    if (!entry) {
        logger.warn(
            `⚠️  Stashed changes but could not uniquely re-identify "${chalk.cyan(name)}" - find and recover it by hand: git stash list`,
        );
        return undefined;
    }

    logger.info(`✅ Changes stashed successfully`);
    return { name, sha: entry.sha };
}

/**
 * Re-apply a stash pushed by {@link pushNamedStash}, then drop it.
 *
 * Applies by SHA, never by position: a concurrent push from a sibling worktree between the two
 * calls could have shifted any `stash@{n}` index onto the wrong entry. The drop re-resolves the
 * entry's CURRENT `stash@{n}` from its unique message, because `git stash drop` - unlike `apply` -
 * only accepts a `stash@{n}` ref, and the index may have moved again since the SHA was captured.
 */
export async function applyNamedStash(git: SimpleGit, stash: NamedStash, logger: Logger): Promise<void> {
    try {
        logger.info(`📦 Applying stashed changes: ${chalk.cyan(stash.name)}`);
        await git.stash(['apply', stash.sha]);
        logger.info(`✅ Stashed changes applied successfully`);

        const entry = await findUniqueStash(git, stash.name);

        if (entry) {
            await git.stash(['drop', entry.ref]);
        } else {
            logger.warn(
                `⚠️  Applied but could not find stash "${chalk.cyan(stash.name)}" to drop it - remove it by hand: git stash list && git stash drop <ref>`,
            );
        }
    } catch (error) {
        logger.error(`❌ Failed to apply stash "${chalk.cyan(stash.name)}": ${(error as Error).message}`);
        logger.info(
            `💡 Recover it by hand - find "${stash.name}" with: git stash list, then: git stash apply <sha-or-ref>`,
        );
    }
}

/**
 * Find a stash entry by its exact, unique message. Never guesses: returns undefined when the
 * message matches zero or more than one entry, so the caller fails loudly - and names the stash
 * for manual recovery - instead of silently picking one.
 */
async function findUniqueStash(
    git: SimpleGit,
    uniqueMessage: string,
): Promise<{ sha: string; ref: string } | undefined> {
    const raw = await git.raw(['stash', 'list', '--format=%H%x1f%gd%x1f%gs']);

    const matches = raw
        .split('\n')
        .filter(line => line.length > 0)
        .map(line => {
            const [sha, ref, subject] = line.split('');
            return { sha: sha ?? '', ref: ref ?? '', subject: subject ?? '' };
        })
        .filter(entry => entry.subject.includes(uniqueMessage));

    if (matches.length !== 1) {
        return undefined;
    }

    const only = assertValue(matches[0], 'unreachable: length checked above');
    return { sha: only.sha, ref: only.ref };
}
