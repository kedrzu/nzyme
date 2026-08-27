import type { simpleGit } from 'simple-git';

/**
 * Count the commits in a revision range, e.g. `main..feature` for what `feature` has that `main`
 * does not.
 *
 * Both refs must resolve. A git error is left to propagate rather than being read as zero, because
 * the two are not the same answer: a range git cannot resolve says nothing about whether one branch
 * is caught up with another, and treating it as "no commits" silently turns a broken ref into
 * "already up to date". Callers that may be handed a branch with no local counterpart resolve it
 * first with `ensureLocalBranch`.
 */
export async function countCommits(git: ReturnType<typeof simpleGit>, range: string): Promise<number> {
    const result = await git.raw(['rev-list', '--count', range]);

    return Number.parseInt(result.trim(), 10);
}
