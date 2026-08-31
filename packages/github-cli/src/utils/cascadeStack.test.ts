import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';

import { createTestLogger } from '@nzyme/logging';

import { GitMergeConflictError } from './GitMergeConflictError.js';
import { cascadeStack } from './cascadeStack.js';

const { logger } = createTestLogger('cascadeStack');

let repo: string;
let origin: string;
let cwd: string;

/**
 * Build a 3-node stack on a real repository: `bottom` <- `mid` <- `top`, each adding its own file,
 * with a bare origin so pushes have somewhere to go.
 */
beforeEach(async () => {
    cwd = process.cwd();
    const root = await mkdtemp(join(tmpdir(), 'cascade-stack-'));
    origin = join(root, 'origin.git');
    repo = join(root, 'repo');

    await simpleGit().raw(['init', '--bare', '--initial-branch=main', origin]);
    await simpleGit().raw(['init', '--initial-branch=main', repo]);

    const git = simpleGit(repo);
    await git.addConfig('user.email', 'test@example.com');
    await git.addConfig('user.name', 'Test');
    await git.addConfig('commit.gpgsign', 'false');
    await git.raw(['remote', 'add', 'origin', origin]);

    await Bun.write(join(repo, 'trunk.txt'), 'trunk\n');
    await git.add('.');
    await git.commit('trunk');
    await git.push(['-u', 'origin', 'main']);

    for (const [branch, file] of [
        ['bottom', 'a.txt'],
        ['mid', 'b.txt'],
        ['top', 'c.txt'],
    ] as const) {
        await git.checkoutLocalBranch(branch);
        await Bun.write(join(repo, file), `${branch}\n`);
        await git.add('.');
        await git.commit(branch);
        await git.push(['-u', 'origin', branch]);
    }

    process.chdir(repo);
});

afterEach(async () => {
    process.chdir(cwd);
    await rm(join(repo, '..'), { recursive: true, force: true });
});

describe('cascadeStack', () => {
    test('carries a new bottom commit all the way to the top', async () => {
        const git = simpleGit(repo);

        await git.checkout('bottom');
        await Bun.write(join(repo, 'new.txt'), 'added later\n');
        await git.add('.');
        await git.commit('later work on bottom');
        await git.push();

        const pushedHeads = await cascadeStack({ branches: ['bottom', 'mid', 'top'], logger });

        // Every node now contains the bottom's new commit — that is exactly what GitHub requires of
        // a stack, and what makes each node's diff show only its own layer.
        for (const branch of ['mid', 'top']) {
            const missing = await git.raw(['rev-list', '--count', `${branch}..bottom`]);
            expect(missing.trim()).toBe('0');
        }

        // The merge gate pins each node's checks to these, so they have to be the commits that
        // actually reached the remote — and `bottom`, which this never pushed, must not claim one.
        expect([...pushedHeads.keys()]).toEqual(['mid', 'top']);
        for (const [branch, sha] of pushedHeads) {
            expect(sha).toBe(await git.revparse([`origin/${branch}`]));
        }
    });

    test('carries a new bottom commit to a node whose branch was never checked out locally', async () => {
        const git = simpleGit(repo);

        // The common `merge/SKILL.md` flow: the worktree only ever checked out the bottom node, so
        // `top`'s branch exists on the remote (`stackTask` creates it there) but has no local
        // counterpart here — exactly the case that used to read as "already up to date" and skip.
        await git.checkout('bottom');
        await git.raw(['branch', '-D', 'top']);

        await Bun.write(join(repo, 'new.txt'), 'added later\n');
        await git.add('.');
        await git.commit('later work on bottom');
        await git.push();

        await cascadeStack({ branches: ['bottom', 'mid', 'top'], logger });

        // `top` picked up the change even though it had to be created locally from `origin/top` first.
        const missing = await git.raw(['rev-list', '--count', 'top..bottom']);
        expect(missing.trim()).toBe('0');
    });

    test('leaves the caller on the branch they started from', async () => {
        const git = simpleGit(repo);

        await git.checkout('bottom');
        await Bun.write(join(repo, 'new.txt'), 'added later\n');
        await git.add('.');
        await git.commit('later work on bottom');
        await git.push();
        await git.checkout('top');

        await cascadeStack({ branches: ['bottom', 'mid', 'top'], logger });

        expect((await git.status()).current).toBe('top');
    });

    test('does nothing when every node already has its parent', async () => {
        const git = simpleGit(repo);
        const before = await git.raw(['rev-parse', 'mid', 'top']);

        const pushedHeads = await cascadeStack({ branches: ['bottom', 'mid', 'top'], logger });

        expect(await git.raw(['rev-parse', 'mid', 'top'])).toBe(before);
        // Nothing was pushed, so nothing is reported — a caller gating on a head this never sent
        // would wait out its timeout for a commit GitHub was never going to report.
        expect(pushedHeads.size).toBe(0);
    });

    test('a single-node stack is a no-op', async () => {
        const git = simpleGit(repo);
        await git.checkout('bottom');

        await cascadeStack({ branches: ['bottom'], logger });

        expect((await git.status()).current).toBe('bottom');
    });

    test('reports which node conflicted, against what, and stops there', async () => {
        const git = simpleGit(repo);

        // Both nodes touch the same line, so carrying the bottom up cannot merge cleanly.
        await git.checkout('bottom');
        await Bun.write(join(repo, 'shared.txt'), 'bottom version\n');
        await git.add('.');
        await git.commit('bottom claims shared.txt');
        await git.push();

        await git.checkout('mid');
        await Bun.write(join(repo, 'shared.txt'), 'mid version\n');
        await git.add('.');
        await git.commit('mid claims shared.txt');
        await git.push();

        const error = await cascadeStack({ branches: ['bottom', 'mid', 'top'], logger }).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(GitMergeConflictError);
        const conflict = error as GitMergeConflictError;
        expect(conflict.conflictedFiles).toEqual(['shared.txt']);
        expect(conflict.stackContext).toEqual({
            nodeBranch: 'mid',
            nodePosition: 2,
            nodeCount: 3,
            against: 'bottom',
        });

        // The conflicted node stays checked out and mid-merge, so the resolution happens where it
        // belongs; `top` is untouched because the run stopped rather than skipping ahead.
        expect((await git.status()).current).toBe('mid');
        expect((await simpleGit(repo).raw(['rev-list', '--count', 'top..mid'])).trim()).not.toBe('0');
    });
});
