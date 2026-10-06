import path from 'node:path';

import type { CommitSummary } from './GitRepository.js';
import { GitRepository } from './GitRepository.js';

/** Inputs for {@link bumpSubmodule}. */
export interface BumpSubmoduleOptions {
    /** The product repository (its working directory). */
    repoDir: string;
    /** Path of the submodule within the product repository, e.g. `nzyme`. */
    submodulePath: string;
    /**
     * What to move the submodule to: a branch (`main`, or `origin/main` — the remote prefix is
     * stripped and the branch fetched fresh), a tag or a commit SHA.
     */
    source: string;
    /** Remote of the submodule to fetch from. */
    remote: string;
}

/** The gitlink already points at the source commit; nothing was changed or staged. */
export interface BumpUnchanged {
    changed: false;
    submodulePath: string;
    source: string;
    current: string;
}

/** The submodule was moved and the new gitlink staged. */
export interface BumpChanged {
    changed: true;
    submodulePath: string;
    source: string;
    previous: string;
    current: string;
    /** Commits the bump brings in, newest first (`git log previous..current`). */
    commits: CommitSummary[];
    /** Commits of the previous pin that the new one does not contain — non-zero means a rollback or divergence. */
    droppedCount: number;
    /** `https://github.com/<owner>/<repo>` of the submodule, or `null` when it is not on GitHub. */
    repoUrl: string | null;
}

/** Outcome of {@link bumpSubmodule}. */
export type BumpResult = BumpUnchanged | BumpChanged;

/**
 * Moves the submodule to a source ref and stages the new gitlink in the product repository —
 * the first half of a bump PR, whose CI then decides whether that nzyme commit is good for the
 * product. Commits and pushes nothing: how the change lands (PR, auto-merge, cadence) is the
 * product's policy, not the CLI's.
 */
export async function bumpSubmodule(options: BumpSubmoduleOptions): Promise<BumpResult> {
    const { repoDir, submodulePath, source, remote } = options;

    const product = new GitRepository(repoDir);
    const previous = await product.readGitlink(submodulePath);

    const submodule = new GitRepository(path.resolve(repoDir, submodulePath));
    await submodule.assertCheckedOut();
    await submodule.ensureFullHistory(remote);
    const current = await resolveSource({ submodule, remote, source });

    if (current === previous) {
        return { changed: false, submodulePath, source, current };
    }

    await submodule.git(['-c', 'advice.detachedHead=false', 'checkout', '--quiet', '--detach', current]);
    await product.git(['add', '--', submodulePath]);

    return {
        changed: true,
        submodulePath,
        source,
        previous,
        current,
        commits: await submodule.listCommits(previous, current),
        droppedCount: await submodule.countCommits(current, previous),
        repoUrl: await submodule.getGitHubRepoUrl(remote),
    };
}

/** Inputs for {@link resolveSource}. */
interface ResolveSourceOptions {
    submodule: GitRepository;
    remote: string;
    source: string;
}

/**
 * Resolves the source to a commit, fetching it first so a branch means its tip on the remote now,
 * not whatever the clone last saw. Falls back to a local lookup for what cannot be fetched by name
 * (an abbreviated SHA).
 */
async function resolveSource(options: ResolveSourceOptions): Promise<string> {
    const { submodule, remote, source } = options;

    const remotePrefix = `${remote}/`;
    const ref = source.startsWith(remotePrefix) ? source.slice(remotePrefix.length) : source;

    const fetched = await submodule.fetchCommit(remote, ref);
    if (fetched) {
        return fetched;
    }

    const local = await submodule.resolveLocalCommit(source);
    if (local) {
        return local;
    }

    throw new Error(`Cannot resolve "${source}" to a commit in ${submodule.dir} (not on "${remote}", not local).`);
}
