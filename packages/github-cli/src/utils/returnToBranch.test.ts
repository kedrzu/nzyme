import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';

import { createTestLogger } from '@nzyme/logging';

import { returnToBranch } from './returnToBranch.js';

const { logger } = createTestLogger('returnToBranch');

let repo: string;
let cwd: string;

/**
 * A repository with two branches that both touch the same file, so a merge between them conflicts
 * on demand.
 */
beforeEach(async () => {
    cwd = process.cwd();
    const root = await mkdtemp(join(tmpdir(), 'return-to-branch-'));
    repo = join(root, 'repo');

    await simpleGit().raw(['init', '--initial-branch=main', repo]);

    const git = simpleGit(repo);
    await git.addConfig('user.email', 'test@example.com');
    await git.addConfig('user.name', 'Test');
    await git.addConfig('commit.gpgsign', 'false');

    await Bun.write(join(repo, 'shared.txt'), 'trunk\n');
    await git.add('.');
    await git.commit('trunk');

    for (const branch of ['bottom', 'top'] as const) {
        await git.checkout(['-b', branch, 'main']);
        await Bun.write(join(repo, 'shared.txt'), `${branch}\n`);
        await git.add('.');
        await git.commit(branch);
    }

    process.chdir(repo);
});

afterEach(async () => {
    process.chdir(cwd);
    await rm(join(repo, '..'), { recursive: true, force: true });
});

describe('returnToBranch', () => {
    test('switches back to where the command started', async () => {
        const git = simpleGit(repo);
        await git.checkout('bottom');

        await returnToBranch('top', logger);

        expect((await git.status()).current).toBe('top');
    });

    test('does nothing when already there', async () => {
        const git = simpleGit(repo);
        await git.checkout('top');

        await returnToBranch('top', logger);

        expect((await git.status()).current).toBe('top');
    });

    test('stays put when the tree is mid-conflict', async () => {
        const git = simpleGit(repo);
        await git.checkout('bottom');
        await git.merge(['top']).catch(() => {
            // Expected: both branches changed shared.txt.
        });

        expect((await git.status()).conflicted.length).toBeGreaterThan(0);

        await returnToBranch('top', logger);

        // Switching away would strand the resolution the user is about to make.
        expect((await git.status()).current).toBe('bottom');
    });

    test('stays put when the branch is gone', async () => {
        const git = simpleGit(repo);
        await git.checkout('bottom');

        await returnToBranch('deleted-after-merge', logger);

        expect((await git.status()).current).toBe('bottom');
    });

    test('reports rather than throws, so it cannot mask what the command was saying', async () => {
        const git = simpleGit(repo);
        await git.checkout('bottom');

        // An uncommitted change that the checkout would have to clobber.
        await Bun.write(join(repo, 'shared.txt'), 'uncommitted\n');

        expect(await returnToBranch('top', logger)).toBeUndefined();
    });
});
