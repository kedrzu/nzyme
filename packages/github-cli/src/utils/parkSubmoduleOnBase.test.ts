import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { SimpleGit } from 'simple-git';
import { simpleGit } from 'simple-git';

import { UsageError } from '@nzyme/cli';
import { createTestLogger } from '@nzyme/logging';

import { parkSubmoduleOnBase } from './parkSubmoduleOnBase.js';

/**
 * Build a bare origin holding `main` with a tracked file (two commits), cloned into a working copy —
 * mirroring how a submodule working tree relates to its remote.
 */
async function setupRepo(root: string): Promise<{ work: SimpleGit; baseTip: string }> {
    const remote = join(root, 'origin.git');
    const seed = join(root, 'seed');
    const work = join(root, 'work');

    const bare = simpleGit();
    await bare.init(['--bare', remote]);
    await bare.cwd(remote).raw(['symbolic-ref', 'HEAD', 'refs/heads/main']);

    await simpleGit().clone(remote, seed);
    const s = simpleGit({ baseDir: seed, config: ['user.email=t@t', 'user.name=t'] });
    await s.checkoutLocalBranch('main');
    writeFileSync(join(seed, 'README'), 'v0\n');
    await s.add('README');
    await s.commit('c0');
    writeFileSync(join(seed, 'README'), 'v1\n');
    await s.add('README');
    await s.commit('c1');
    const baseTip = (await s.revparse(['HEAD'])).trim();
    await s.push(['-u', 'origin', 'main']);

    await simpleGit().clone(remote, work);
    const workGit = simpleGit({ baseDir: work, config: ['user.email=t@t', 'user.name=t'] });

    return { work: workGit, baseTip };
}

let root: string;

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'park-submodule-'));
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

test('parks a submodule whose HEAD is a non-ancestor task commit onto the base tip', async () => {
    const { work, baseTip } = await setupRepo(root);
    const { logger } = createTestLogger('parkSubmoduleOnBase');

    // Simulate the post-squash state: HEAD detached at a task commit that is NOT an ancestor of
    // origin/main (a squash merge breaks the ancestry link).
    await work.checkout(['--detach']);
    await work.commit('task-work', [], { '--allow-empty': null });
    expect((await work.status()).detached).toBe(true);

    await parkSubmoduleOnBase({ git: work, baseBranch: 'main', logger, repoDisplayName: 'sub' });

    const status = await work.status();
    expect(status.detached).toBe(false);
    expect(status.current).toBe('main');
    expect((await work.revparse(['HEAD'])).trim()).toBe(baseTip);
});

test('aborts and leaves the submodule untouched when the working tree is dirty', async () => {
    const { work } = await setupRepo(root);
    const { logger } = createTestLogger('parkSubmoduleOnBase');

    await work.checkout(['--detach']);
    await work.commit('task-work', [], { '--allow-empty': null });
    const before = (await work.revparse(['HEAD'])).trim();

    // Uncommitted change to a tracked file.
    writeFileSync(join(root, 'work', 'README'), 'dirty\n');

    await expect(
        parkSubmoduleOnBase({ git: work, baseBranch: 'main', logger, repoDisplayName: 'sub' }),
    ).rejects.toBeInstanceOf(UsageError);

    // HEAD is unchanged — nothing was reset.
    expect((await work.revparse(['HEAD'])).trim()).toBe(before);
    expect((await work.status()).detached).toBe(true);
});
