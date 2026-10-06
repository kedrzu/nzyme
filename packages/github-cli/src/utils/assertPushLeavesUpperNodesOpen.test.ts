import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SimpleGit } from 'simple-git';
import { simpleGit } from 'simple-git';

import { assertPushLeavesUpperNodesOpen } from './assertPushLeavesUpperNodesOpen.js';

let root: string;
let git: SimpleGit;

/**
 * A two-node stack, `lower` <- `upper`, each with its own commit and pushed to a bare origin, with
 * `lower` checked out.
 */
beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'upper-nodes-open-'));
    const origin = join(root, 'origin.git');
    const repo = join(root, 'repo');

    await simpleGit().raw(['init', '--bare', '--initial-branch=main', origin]);
    await simpleGit().raw(['init', '--initial-branch=main', repo]);

    git = simpleGit(repo);
    await git.addConfig('user.email', 'test@example.com');
    await git.addConfig('user.name', 'Test');
    await git.addConfig('commit.gpgsign', 'false');
    await git.raw(['remote', 'add', 'origin', origin]);
    await git.commit('trunk', [], { '--allow-empty': null });
    await git.push(['-u', 'origin', 'main']);

    for (const branch of ['lower', 'upper']) {
        await git.checkoutLocalBranch(branch);
        await git.commit(branch, [], { '--allow-empty': null });
        await git.push(['-u', 'origin', branch]);
    }

    await git.checkout('lower');
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

test('lets through an upper head the remote already contains, or one this clone never fetched', async () => {
    await git.merge(['origin/upper']);
    await git.push(['origin', 'lower']);
    await git.commit('more lower work', [], { '--allow-empty': null });

    const push = assertPushLeavesUpperNodesOpen({
        git,
        branch: 'lower',
        upperNodes: [
            { branch: 'upper', head: 'origin/upper' },
            { branch: 'elsewhere', head: '0123456789abcdef0123456789abcdef01234567' },
        ],
    });

    await expect(push).resolves.toBeUndefined();
});
