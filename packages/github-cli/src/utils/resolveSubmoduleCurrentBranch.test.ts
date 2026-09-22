import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, test } from 'bun:test';
import { simpleGit } from 'simple-git';

import type { SubmoduleInfo } from './getSubmoduleInfo.js';
import { resolveSubmoduleCurrentBranch } from './resolveSubmoduleCurrentBranch.js';

const BASE_BRANCHES = ['main'];

function baseSubmodule(path: string): Omit<SubmoduleInfo, 'currentBranch' | 'detached'> {
    return {
        path,
        name: 'sub',
        url: 'https://github.com/acme/sub.git',
        hasChanges: false,
        unpushedCommitsCount: 0,
        hasRemoteBranch: true,
    };
}

/**
 * Build a bare origin plus a working clone with a `main` base branch and a non-base branch cut
 * from it — named the way a pre-HLD-528 task branch was (`feature/sig-519-thing`), to prove the
 * branch-based lookup this function feeds needs no migration for those names.
 *
 * `baseTip` is committed to `main` only *after* the task branch is cut, so it is reachable
 * exclusively from `main` — cutting the task branch afterwards would leave `baseTip` an ancestor of
 * both, which is not the "on base only" shape this is meant to set up (mirrors
 * `resolveSubmoduleBranch.test.ts`'s `setupRepo`).
 */
async function setupRepo(root: string): Promise<{ workPath: string; taskTip: string; baseTip: string }> {
    const remote = join(root, 'origin.git');
    const workPath = join(root, 'work');

    const bare = simpleGit();
    await bare.init(['--bare', remote]);
    await bare.cwd(remote).raw(['symbolic-ref', 'HEAD', 'refs/heads/main']);

    await simpleGit().clone(remote, workPath);
    const work = simpleGit({ baseDir: workPath, config: ['user.email=t@t', 'user.name=t'] });
    await work.checkoutLocalBranch('main');
    await work.commit('c0', [], { '--allow-empty': null });
    await work.push(['-u', 'origin', 'main']);

    await work.checkoutBranch('feature/sig-519-thing', 'main');
    await work.commit('task work', [], { '--allow-empty': null });
    const taskTip = (await work.revparse(['HEAD'])).trim();
    await work.push(['-u', 'origin', 'feature/sig-519-thing']);

    await work.checkout(['main']);
    await work.commit('c1', [], { '--allow-empty': null });
    const baseTip = (await work.revparse(['HEAD'])).trim();
    await work.push(['origin', 'main']);

    return { workPath, taskTip, baseTip };
}

let root: string;

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'resolve-submodule-current-branch-'));
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

test('an attached HEAD on a non-base branch resolves to that branch, by name', async () => {
    const { workPath } = await setupRepo(root);
    const work = simpleGit({ baseDir: workPath });
    await work.checkout('feature/sig-519-thing');

    const result = await resolveSubmoduleCurrentBranch({
        submodule: { ...baseSubmodule(workPath), currentBranch: 'feature/sig-519-thing', detached: false },
        baseBranches: BASE_BRANCHES,
    });

    expect(result).toEqual({ kind: 'branch', name: 'feature/sig-519-thing' });
});

test('an attached HEAD on a base branch resolves to base', async () => {
    const { workPath } = await setupRepo(root);

    const result = await resolveSubmoduleCurrentBranch({
        submodule: { ...baseSubmodule(workPath), currentBranch: 'main', detached: false },
        baseBranches: BASE_BRANCHES,
    });

    expect(result).toEqual({ kind: 'base' });
});

// The regression this task replaces: a detached HEAD used to be filtered out by a branch-name
// check against `sub.currentBranch`, which is always undefined for a detached submodule — so the
// check always failed and silently skipped exactly the ordinary state a gitlink-pinned submodule
// is in.
test('a detached HEAD is resolved from its commit, not skipped', async () => {
    const { workPath, taskTip } = await setupRepo(root);
    const work = simpleGit({ baseDir: workPath });
    await work.checkout(taskTip);
    expect((await work.status()).detached).toBe(true);

    const result = await resolveSubmoduleCurrentBranch({
        submodule: { ...baseSubmodule(workPath), currentBranch: undefined, detached: true },
        baseBranches: BASE_BRANCHES,
    });

    expect(result).toEqual({ kind: 'branch', name: 'feature/sig-519-thing' });
});

test('a detached HEAD reachable only from a base branch resolves to base', async () => {
    const { workPath, baseTip } = await setupRepo(root);
    const work = simpleGit({ baseDir: workPath });
    await work.checkout(baseTip);
    expect((await work.status()).detached).toBe(true);

    const result = await resolveSubmoduleCurrentBranch({
        submodule: { ...baseSubmodule(workPath), currentBranch: undefined, detached: true },
        baseBranches: BASE_BRANCHES,
    });

    expect(result).toEqual({ kind: 'base' });
});
