import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { SimpleGit } from 'simple-git';
import { simpleGit } from 'simple-git';

import { createTestLogger } from '@nzyme/logging';

import { switchDetachedSubmoduleToBaseBranch } from './switchDetachedSubmoduleToBaseBranch.js';

/**
 * Build a tiny git repo with a bare origin holding a `main` base branch with two commits,
 * cloned into a working copy. Mirrors how a submodule working tree relates to its remote.
 */
async function setupRepo(root: string): Promise<{ work: SimpleGit; baseTip: string; baseFirst: string }> {
    const remote = join(root, 'origin.git');
    const seed = join(root, 'seed');
    const work = join(root, 'work');

    const bare = simpleGit();
    await bare.init(['--bare', remote]);
    await bare.cwd(remote).raw(['symbolic-ref', 'HEAD', 'refs/heads/main']);

    const seedGit = simpleGit().clone(remote, seed);
    await seedGit;
    const s = simpleGit({ baseDir: seed, config: ['user.email=t@t', 'user.name=t'] });
    await s.checkoutLocalBranch('main');
    await s.commit('c0', [], { '--allow-empty': null });
    const baseFirst = (await s.revparse(['HEAD'])).trim();
    await s.commit('c1', [], { '--allow-empty': null });
    const baseTip = (await s.revparse(['HEAD'])).trim();
    await s.push(['-u', 'origin', 'main']);

    await simpleGit().clone(remote, work);
    const workGit = simpleGit({ baseDir: work, config: ['user.email=t@t', 'user.name=t'] });

    return { work: workGit, baseTip, baseFirst };
}

let root: string;

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'switch-detached-'));
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

test('switches a detached submodule onto the base branch at the latest commit', async () => {
    const { work, baseTip, baseFirst } = await setupRepo(root);
    const { logger } = createTestLogger('switchDetachedSubmoduleToBaseBranch');

    // Detach HEAD at an older base commit, as a superproject gitlink would pin it.
    await work.checkout([baseFirst]);
    expect((await work.status()).detached).toBe(true);

    const switched = await switchDetachedSubmoduleToBaseBranch({
        git: work,
        baseBranch: 'main',
        logger,
        repoDisplayName: 'sub',
    });

    expect(switched).toBe(true);

    const status = await work.status();
    expect(status.detached).toBe(false);
    expect(status.current).toBe('main');
    // Fast-forwarded to the latest base commit.
    expect((await work.revparse(['HEAD'])).trim()).toBe(baseTip);
});

test('leaves the submodule detached when HEAD has commits not on the base branch', async () => {
    const { work } = await setupRepo(root);
    const { logger, logs } = createTestLogger('switchDetachedSubmoduleToBaseBranch');

    // Detach and create a commit that is not part of origin/main.
    await work.checkout(['main']);
    await work.checkout(['--detach']);
    await work.commit('local-only', [], { '--allow-empty': null });
    const orphanRisk = (await work.revparse(['HEAD'])).trim();

    const switched = await switchDetachedSubmoduleToBaseBranch({
        git: work,
        baseBranch: 'main',
        logger,
        repoDisplayName: 'sub',
    });

    expect(switched).toBe(false);
    const status = await work.status();
    expect(status.detached).toBe(true);
    // The unique commit is still checked out — nothing was orphaned.
    expect((await work.revparse(['HEAD'])).trim()).toBe(orphanRisk);
    expect(logs.some(l => l.level === 'warn')).toBe(true);
});

test('leaves the submodule detached when the local base branch has unpushed commits', async () => {
    const { work, baseFirst } = await setupRepo(root);
    const { logger, logs } = createTestLogger('switchDetachedSubmoduleToBaseBranch');

    // Someone worked directly on local `main`, advancing it past origin/main with an
    // unpushed commit, before the superproject pinned a commit and detached HEAD.
    await work.checkout(['main']);
    await work.commit('local-unpushed', [], { '--allow-empty': null });
    const unpushed = (await work.revparse(['main'])).trim();

    // Now detach HEAD at a commit that IS contained in origin/main, so the detached-HEAD
    // safety check alone would pass and force-reset local `main`, orphaning the unpushed commit.
    await work.checkout([baseFirst]);
    expect((await work.status()).detached).toBe(true);

    const switched = await switchDetachedSubmoduleToBaseBranch({
        git: work,
        baseBranch: 'main',
        logger,
        repoDisplayName: 'sub',
    });

    expect(switched).toBe(false);
    // Local `main` still points at the unpushed commit — it was NOT reset to origin/main.
    expect((await work.revparse(['main'])).trim()).toBe(unpushed);
    // The submodule is left detached rather than discarding the unpushed work.
    expect((await work.status()).detached).toBe(true);
    expect(logs.some(l => l.level === 'warn')).toBe(true);
});

test('leaves the submodule as-is when the base branch is missing on the remote', async () => {
    const { work, baseFirst } = await setupRepo(root);
    const { logger } = createTestLogger('switchDetachedSubmoduleToBaseBranch');

    await work.checkout([baseFirst]);

    const switched = await switchDetachedSubmoduleToBaseBranch({
        git: work,
        baseBranch: 'nonexistent-base',
        logger,
        repoDisplayName: 'sub',
    });

    expect(switched).toBe(false);
    expect((await work.status()).detached).toBe(true);
});
