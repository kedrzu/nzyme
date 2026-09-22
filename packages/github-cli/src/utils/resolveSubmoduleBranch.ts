import type { SimpleGit } from 'simple-git';

import { UsageError } from '@nzyme/cli';

import { pickSubmoduleBranch } from './pickSubmoduleBranch.js';

/**
 * Inputs to {@link resolveSubmoduleBranch}.
 */
export interface ResolveSubmoduleBranchParams {
    /**
     * Git instance scoped to the submodule working tree. The submodule remote must already be
     * fetched — this function runs no fetch of its own, matching the CI check it mirrors
     * (`.github/scripts/verify-submodule-refs.ts`).
     */
    git: SimpleGit;

    /**
     * The submodule's gitlink commit — the only fact the main repo actually records about the
     * submodule's state, and therefore the only input this function trusts.
     */
    sha: string;

    /**
     * Branches that count as "base" for the caller's project (e.g. `['main', 'release']`).
     * Supplied by the caller — this package is generic and must never hardcode a project's own
     * branch naming.
     */
    baseBranches: string[];

    /**
     * Display name of the submodule, used to name it in a thrown `UsageError`.
     */
    repoDisplayName: string;
}

/**
 * Verdict of {@link resolveSubmoduleBranch}. Unlike {@link pickSubmoduleBranch}'s result, there is
 * no `ambiguous` case here — see the function doc for why.
 */
export type ResolveSubmoduleBranchResult = { kind: 'base' } | { kind: 'branch'; name: string };

/**
 * Resolve which branch, if any, a submodule's gitlink SHA belongs to — straight from the
 * submodule's own remote, with no naming convention or issue ID involved. This is the only link
 * left between a task and its submodule state once branch/PR names carry nothing in common; see
 * `docs/decisions/submodule-branch-resolved-from-gitlink-sha.md`.
 *
 * Runs `git branch -r --contains <sha>` in the submodule and parses its output into clean remote
 * branch names before handing them to {@link pickSubmoduleBranch}, which does no parsing of its
 * own. When more than one non-base branch contains the SHA, the two branches are — by
 * definition — different tasks sharing a commit, so this throws a `UsageError` naming every
 * candidate rather than guessing: picking one here would silently attach the submodule to the
 * wrong task.
 * @param params The gitlink SHA to resolve, the caller's base branches, and git/display context.
 * @returns `base` when the SHA is reachable only from a base branch, `branch` with its name
 * otherwise.
 */
export async function resolveSubmoduleBranch(
    params: ResolveSubmoduleBranchParams,
): Promise<ResolveSubmoduleBranchResult> {
    const { git, sha, baseBranches, repoDisplayName } = params;

    const rawOutput = await git.raw(['branch', '-r', '--contains', sha]);
    const candidates = parseContainingBranches(rawOutput);

    const verdict = pickSubmoduleBranch({ candidates, baseBranches });

    if (verdict.kind === 'base') {
        return { kind: 'base' };
    }

    if (verdict.kind === 'branch') {
        return { kind: 'branch', name: verdict.name };
    }

    const candidateList = verdict.candidates.map(name => `  - ${name}`).join('\n');
    throw new UsageError(
        `${repoDisplayName}'s commit ${sha} is reachable from more than one branch:\n${candidateList}\n` +
            'Check out the branch you intend to work on and try again — a submodule commit shared ' +
            'by two task branches cannot be resolved automatically.',
    );
}

/**
 * Parse the raw output of `git branch -r --contains <sha>` into clean remote branch names: trims
 * whitespace, drops the `origin/HEAD -> origin/<default>` pointer line, and strips the leading
 * `origin/` remote prefix. The result is ready for {@link pickSubmoduleBranch} as-is.
 * @__NO_SIDE_EFFECTS__
 */
export function parseContainingBranches(rawOutput: string): string[] {
    return rawOutput
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.includes('->'))
        .map(line => (line.startsWith('origin/') ? line.slice('origin/'.length) : line));
}
