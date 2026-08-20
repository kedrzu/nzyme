import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';

import { syncStackNodesFromRemote } from './syncStackNodesFromRemote.js';

/**
 * Silent logger — these tests assert on git state, not on output.
 */
const logger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
} as unknown as Parameters<typeof syncStackNodesFromRemote>[0]['logger'];

let repo: string;
let cwd: string;

/**
 * A single-node stack whose remote has moved ahead: `bottom` is pushed, gains one more commit on the
 * remote, and is then rewound locally — the shape left behind when the server rebases a stack.
 */
beforeEach(async () => {
    cwd = process.cwd();
    const root = await mkdtemp(join(tmpdir(), 'sync-stack-nodes-'));
    const origin = join(root, 'origin.git');
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

    await git.checkoutLocalBranch('bottom');
    await Bun.write(join(repo, 'work.txt'), 'committed work\n');
    await git.add('.');
    await git.commit('bottom');
    await git.push(['-u', 'origin', 'bottom']);

    await Bun.write(join(repo, 'remote.txt'), 'written on the server\n');
    await git.add('.');
    await git.commit('server-side rewrite');
    await git.push();

    // Rewind the local branch so the remote is one commit ahead with nothing unpushed locally.
    await git.raw(['reset', '--hard', 'HEAD~1']);

    process.chdir(repo);
});

afterEach(async () => {
    process.chdir(cwd);
    await rm(join(repo, '..'), { recursive: true, force: true });
});

describe('syncStackNodesFromRemote', () => {
    test('keeps uncommitted work on the checked-out node instead of resetting onto the remote', async () => {
        const git = simpleGit(repo);
        const before = (await git.revparse('HEAD')).trim();

        await Bun.write(join(repo, 'work.txt'), 'half an hour of uncommitted edits\n');

        await syncStackNodesFromRemote({ branches: ['bottom'], logger });

        expect(await Bun.file(join(repo, 'work.txt')).text()).toBe('half an hour of uncommitted edits\n');
        expect((await git.revparse('HEAD')).trim()).toBe(before);
    });

    test('adopts the remote when the working tree is clean', async () => {
        const git = simpleGit(repo);

        await syncStackNodesFromRemote({ branches: ['bottom'], logger });

        expect((await git.revparse('HEAD')).trim()).toBe((await git.revparse('origin/bottom')).trim());
        expect(await Bun.file(join(repo, 'remote.txt')).exists()).toBe(true);
    });
});
