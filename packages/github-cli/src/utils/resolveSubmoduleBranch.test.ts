import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { SimpleGit } from 'simple-git';
import { simpleGit } from 'simple-git';

import { UsageError } from '@nzyme/cli';

import { parseContainingBranches, resolveSubmoduleBranch } from './resolveSubmoduleBranch.js';

const BASE_BRANCHES = ['main'];

test('drops the origin/HEAD pointer line and strips the origin/ prefix', () => {
    const rawOutput = '  origin/HEAD -> origin/main\n  origin/main\n  origin/feature/decouple-submodule-flow\n';

    expect(parseContainingBranches(rawOutput)).toEqual(['main', 'feature/decouple-submodule-flow']);
});

test('trims leading/trailing whitespace on each line', () => {
    expect(parseContainingBranches('   origin/main   \n\torigin/fix/thing\t\n')).toEqual(['main', 'fix/thing']);
});

test('returns an empty list for empty output', () => {
    expect(parseContainingBranches('')).toEqual([]);
    expect(parseContainingBranches('\n\n')).toEqual([]);
});

/**
 * Build a tiny git repo with a bare origin, mirroring how a submodule's gitlink SHA relates to its
 * remote branches:
 * - `forkPoint` — on `main`, and contained by both task branches forked from it afterwards;
 * - `shared` — on `branchA` and `branchB` (cut from `branchA`), never on `main`;
 * - `divergedTip` — only on `branchA`;
 * - `baseTip` — only on `main`, committed after both task branches were cut.
 */
async function setupRepo(
    root: string,
): Promise<{ work: SimpleGit; forkPoint: string; baseTip: string; shared: string; divergedTip: string }> {
    const remote = join(root, 'origin.git');
    const seed = join(root, 'seed');
    const work = join(root, 'work');

    const bare = simpleGit();
    await bare.init(['--bare', remote]);
    await bare.cwd(remote).raw(['symbolic-ref', 'HEAD', 'refs/heads/main']);

    await simpleGit().clone(remote, seed);
    const s = simpleGit({ baseDir: seed, config: ['user.email=t@t', 'user.name=t'] });
    await s.checkoutLocalBranch('main');
    await s.commit('c0', [], { '--allow-empty': null });
    const forkPoint = (await s.revparse(['HEAD'])).trim();
    await s.push(['-u', 'origin', 'main']);

    await s.checkoutBranch('branchA', 'main');
    await s.commit('a0', [], { '--allow-empty': null });
    const shared = (await s.revparse(['HEAD'])).trim();

    await s.checkoutBranch('branchB', 'branchA');
    await s.commit('b1', [], { '--allow-empty': null });
    await s.push(['-u', 'origin', 'branchB']);

    await s.checkout(['branchA']);
    await s.commit('a1', [], { '--allow-empty': null });
    const divergedTip = (await s.revparse(['HEAD'])).trim();
    await s.push(['-u', 'origin', 'branchA']);

    await s.checkout(['main']);
    await s.commit('c1', [], { '--allow-empty': null });
    const baseTip = (await s.revparse(['HEAD'])).trim();
    await s.push(['origin', 'main']);

    await simpleGit().clone(remote, work);
    const workGit = simpleGit({ baseDir: work, config: ['user.email=t@t', 'user.name=t'] });

    return { work: workGit, forkPoint, baseTip, shared, divergedTip };
}

let root: string;

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'resolve-submodule-branch-'));
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

test('a SHA reachable only from a base branch resolves to base', async () => {
    const { work, baseTip } = await setupRepo(root);

    const result = await resolveSubmoduleBranch({
        git: work,
        sha: baseTip,
        baseBranches: BASE_BRANCHES,
        repoDisplayName: 'sub',
    });

    expect(result).toEqual({ kind: 'base' });
});

// HLD-589: every branch forked from base after a commit contains it, so a pin on `main` used to be
// refused as "reachable from more than one branch" as soon as two task branches existed.
test('a SHA on a base branch resolves to base even when task branches forked after it contain it', async () => {
    const { work, forkPoint } = await setupRepo(root);

    const result = await resolveSubmoduleBranch({
        git: work,
        sha: forkPoint,
        baseBranches: BASE_BRANCHES,
        repoDisplayName: 'sub',
    });

    expect(result).toEqual({ kind: 'base' });
});

test('a SHA reachable from exactly one non-base branch resolves to that branch', async () => {
    const { work, divergedTip } = await setupRepo(root);

    const result = await resolveSubmoduleBranch({
        git: work,
        sha: divergedTip,
        baseBranches: BASE_BRANCHES,
        repoDisplayName: 'sub',
    });

    expect(result).toEqual({ kind: 'branch', name: 'branchA' });
});

// The invariant this task must protect: two task branches sharing a commit are never resolved by
// a guess. A regression that picked "the first" or "the most recent" candidate instead of
// throwing would pass every other test here but silently attach the submodule to the wrong task.
test('a SHA reachable from two non-base branches and not from base throws a UsageError naming both', async () => {
    const { work, shared } = await setupRepo(root);

    const failure = resolveSubmoduleBranch({
        git: work,
        sha: shared,
        baseBranches: BASE_BRANCHES,
        repoDisplayName: 'sub',
    });

    await expect(failure).rejects.toThrow(UsageError);
    await expect(failure).rejects.toThrow(/branchA/);
    await expect(failure).rejects.toThrow(/branchB/);
});
