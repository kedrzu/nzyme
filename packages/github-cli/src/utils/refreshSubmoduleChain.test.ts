import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, setDefaultTimeout, test } from 'bun:test';
import { simpleGit } from 'simple-git';

import { UsageError } from '@nzyme/cli';
import { createTestLogger } from '@nzyme/logging';

import type { GithubConfig } from '../GithubConfig.js';
import type { GithubClient } from './createGithubClient.js';
import { GitMergeConflictError } from './GitMergeConflictError.js';
import { restoreSubmoduleHomes } from './refreshSubmoduleChain.js';
import { syncAllRepos } from './syncAllRepos.js';

// Every test builds real repositories and runs whole sync cycles against them.
setDefaultTimeout(60_000);

const GITHUB_CONFIG: GithubConfig = { owner: 'acme', repo: 'main', token: 'ghp_test' };
const LOWER = 'feat/lower';
const UPPER = 'feat/upper';

let root: string;
let originalCwd: string;

beforeEach(() => {
    originalCwd = process.cwd();
    root = mkdtempSync(join(tmpdir(), 'refresh-submodule-chain-'));
});

afterEach(() => {
    process.chdir(originalCwd);
    rmSync(root, { recursive: true, force: true });
});

/**
 * Build a superproject whose submodule carries a two-PR chain — `feat/lower` on `main`,
 * `feat/upper` on `feat/lower` — with the submodule checked out on the upper node, then move the
 * submodule's `main` on, so the lower node is behind the trunk: the HLD-641 shape (#232 on #207).
 *
 * With `conflict`, the lower node and the trunk change the same line of `shared.txt`.
 */
async function setupSubmoduleChain(conflict: boolean) {
    const mainRemote = join(root, 'origin-main.git');
    const subRemote = join(root, 'origin-sub.git');
    const subSeed = join(root, 'sub-seed');
    const mainPath = join(root, 'main');
    const submodulePath = join(mainPath, 'nzyme');

    const bare = simpleGit();
    await bare.init(['--bare', mainRemote]);
    await bare.cwd(mainRemote).raw(['symbolic-ref', 'HEAD', 'refs/heads/main']);
    await bare.init(['--bare', subRemote]);
    await bare.cwd(subRemote).raw(['symbolic-ref', 'HEAD', 'refs/heads/main']);

    await simpleGit().clone(subRemote, subSeed);
    const seed = simpleGit({ baseDir: subSeed, config: ['user.email=t@t', 'user.name=t', 'commit.gpgsign=false'] });
    await seed.checkoutLocalBranch('main');
    writeFileSync(join(subSeed, 'shared.txt'), 'original\n');
    await seed.add(['shared.txt']);
    await seed.commit('sub c0');
    await seed.push(['-u', 'origin', 'main']);

    await seed.checkoutLocalBranch(LOWER);
    writeFileSync(join(subSeed, conflict ? 'shared.txt' : 'lower.txt'), 'lower\n');
    await seed.add(['.']);
    await seed.commit('lower work');
    await seed.push(['-u', 'origin', LOWER]);

    await seed.checkoutLocalBranch(UPPER);
    writeFileSync(join(subSeed, 'upper.txt'), 'upper\n');
    await seed.add(['.']);
    await seed.commit('upper work');
    await seed.push(['-u', 'origin', UPPER]);

    await simpleGit().clone(mainRemote, mainPath);
    const main = simpleGit({ baseDir: mainPath });
    await main.addConfig('user.email', 't@t');
    await main.addConfig('user.name', 't');
    await main.addConfig('commit.gpgsign', 'false');
    await main.checkoutLocalBranch('main');
    await main.commit('main c0', [], { '--allow-empty': null });

    await simpleGit().clone(subRemote, submodulePath);
    const sub = simpleGit({ baseDir: submodulePath });
    await sub.addConfig('user.email', 't@t');
    await sub.addConfig('user.name', 't');
    await sub.addConfig('commit.gpgsign', 'false');
    await sub.checkout(UPPER);

    writeFileSync(
        join(mainPath, '.gitmodules'),
        '[submodule "nzyme"]\n\tpath = nzyme\n\turl = https://github.com/acme/sub.git\n',
    );
    await main.add(['.gitmodules', 'nzyme']);
    await main.commit('add submodule');
    await main.push(['-u', 'origin', 'main']);

    // The trunk moves on after the chain was cut — nothing merges it into the lower node.
    await seed.checkout('main');
    writeFileSync(join(subSeed, conflict ? 'shared.txt' : 'trunk.txt'), 'trunk\n');
    await seed.add(['.']);
    await seed.commit('trunk moved on');
    await seed.push(['origin', 'main']);
    const subTrunkTip = (await seed.revparse(['HEAD'])).trim();

    return { mainPath, submodulePath, subRemote, subTrunkTip };
}

/**
 * A `GithubClient` serving the submodule's two open pull requests, with no stack record — so the
 * chain is found through the upper PR's base. The main repository has no pull requests at all.
 */
const CHAIN_CLIENT = {
    rest: {
        pulls: {
            list: (params: { repo: string; base?: string }) => {
                if (params.repo !== 'sub') {
                    return Promise.resolve({ data: [] });
                }
                const prs = [
                    { number: 207, state: 'open', head: { ref: LOWER, sha: 'x' }, base: { ref: 'main' } },
                    { number: 232, state: 'open', head: { ref: UPPER, sha: 'x' }, base: { ref: LOWER } },
                ];
                return Promise.resolve({ data: prs.filter(pr => !params.base || pr.base.ref === params.base) });
            },
        },
    },
    request: () => Promise.resolve({ status: 200, data: [] }),
} as unknown as GithubClient;

function sync() {
    const { logger } = createTestLogger('refreshSubmoduleChain');
    return syncAllRepos({
        branch: 'main',
        baseBranch: 'main',
        submoduleBase: { kind: 'trunk', trunk: 'main' },
        unattended: true,
        githubClient: CHAIN_CLIENT,
        githubConfig: GITHUB_CONFIG,
        logger,
    });
}

async function containsCommit(git: ReturnType<typeof simpleGit>, ref: string, commit: string) {
    const count = await git.raw(['rev-list', '--count', `${ref}..${commit}`]);
    return count.trim() === '0';
}

test('a lower submodule node behind the trunk is refreshed first and carried up, every node pushed', async () => {
    const { mainPath, submodulePath, subRemote, subTrunkTip } = await setupSubmoduleChain(false);
    process.chdir(mainPath);

    const result = await sync();

    // The trunk entered at the bottom: both nodes now contain it on the remote, and the upper node
    // contains the lower one — not the trunk merged straight into the upper node with the lower one
    // left behind.
    const remote = simpleGit({ baseDir: subRemote });
    const lowerHead = (await remote.revparse([LOWER])).trim();
    const upperHead = (await remote.revparse([UPPER])).trim();
    expect(await containsCommit(remote, LOWER, subTrunkTip)).toBe(true);
    expect(await containsCommit(remote, UPPER, lowerHead)).toBe(true);

    // The submodule is back on the branch it started on, and the gitlink was moved to its new head.
    const sub = simpleGit({ baseDir: submodulePath });
    expect((await sub.status()).current).toBe(UPPER);
    const main = simpleGit({ baseDir: mainPath });
    await main.fetch('origin');
    expect((await main.raw(['rev-parse', 'origin/main:nzyme'])).trim()).toBe(upperHead);

    expect(result.submodulePrs.map(pr => [pr.number, pr.headSha])).toEqual([
        [207, lowerHead],
        [232, upperHead],
    ]);
});

test('a conflict on the lower node stops there, and the re-run after resolving it ends back on the upper node', async () => {
    const { mainPath, submodulePath, subRemote, subTrunkTip } = await setupSubmoduleChain(true);
    process.chdir(mainPath);
    const sub = simpleGit({ baseDir: submodulePath });

    const failure = await sync().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(GitMergeConflictError);
    expect((failure as GitMergeConflictError).stackContext).toEqual({
        nodeBranch: LOWER,
        nodePosition: 1,
        nodeCount: 2,
        against: 'main',
        submodule: 'nzyme',
    });
    // Left where the fix belongs: on the lower node, mid-merge.
    expect((await sub.status()).current).toBe(LOWER);
    expect((await sub.status()).conflicted).toEqual(['shared.txt']);

    writeFileSync(join(submodulePath, 'shared.txt'), 'lower and trunk\n');
    await sub.add(['shared.txt']);
    await sub.commit('resolve the trunk merge');

    await sync();

    // The resolution reached the remote — nothing else would have pushed a node that already
    // contains the trunk — and the upper node was carried on top of it.
    const remote = simpleGit({ baseDir: subRemote });
    const lowerHead = (await remote.revparse([LOWER])).trim();
    const upperHead = (await remote.revparse([UPPER])).trim();
    expect(lowerHead).toBe((await sub.revparse([LOWER])).trim());
    expect(await containsCommit(remote, LOWER, subTrunkTip)).toBe(true);
    expect(await containsCommit(remote, UPPER, lowerHead)).toBe(true);

    // Home is the upper node, not the lower one the conflict left checked out — so the gitlink keeps
    // pointing at the upper node's work.
    expect((await sub.status()).current).toBe(UPPER);
    const main = simpleGit({ baseDir: mainPath });
    await main.fetch('origin');
    expect((await main.raw(['rev-parse', 'origin/main:nzyme'])).trim()).toBe(upperHead);
    expect((await sub.getConfig('nzyme.refreshHome')).value).toBeNull();
});

test('a re-run while the lower node is still mid-merge stops before committing a gitlink at it', async () => {
    const { mainPath, submodulePath } = await setupSubmoduleChain(true);
    process.chdir(mainPath);
    const sub = simpleGit({ baseDir: submodulePath });
    const main = simpleGit({ baseDir: mainPath });
    const gitlinkBefore = (await main.raw(['rev-parse', 'HEAD:nzyme'])).trim();

    expect(await sync().catch((error: unknown) => error)).toBeInstanceOf(GitMergeConflictError);

    // Resolved and staged, but the merge is not committed yet.
    writeFileSync(join(submodulePath, 'shared.txt'), 'lower and trunk\n');
    await sub.add(['shared.txt']);

    expect(await sync().catch((error: unknown) => error)).toBeInstanceOf(UsageError);

    expect((await sub.status()).current).toBe(LOWER);
    expect((await main.raw(['rev-parse', 'HEAD:nzyme'])).trim()).toBe(gitlinkBefore);
    expect((await sub.getConfig('nzyme.refreshHome')).value).toBe(UPPER);
});

test('a rejected push mid-refresh takes the submodule back to the branch the refresh started from', async () => {
    const { mainPath, submodulePath, subRemote } = await setupSubmoduleChain(false);
    process.chdir(mainPath);
    const sub = simpleGit({ baseDir: submodulePath });

    const hook = join(subRemote, 'hooks', 'pre-receive');
    writeFileSync(hook, '#!/bin/sh\nexit 1\n');
    chmodSync(hook, 0o755);

    const failure = await sync().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(GitMergeConflictError);
    expect((await sub.status()).current).toBe(UPPER);
    expect((await sub.getConfig('nzyme.refreshHome')).value).toBeNull();
});

test('a refresh abandoned on one branch leaves the submodule alone once the main repository is on another', async () => {
    const { mainPath, submodulePath } = await setupSubmoduleChain(true);
    process.chdir(mainPath);
    const sub = simpleGit({ baseDir: submodulePath });
    const main = simpleGit({ baseDir: mainPath });

    expect(await sync().catch((error: unknown) => error)).toBeInstanceOf(GitMergeConflictError);

    // The refresh is abandoned, and the main repository moves on to another task, whose submodule
    // branch is checked out.
    await sub.merge(['--abort']);
    await main.checkoutLocalBranch('feat/other-task');
    await sub.checkout('main');

    const { logger } = createTestLogger('refreshSubmoduleChain');
    await restoreSubmoduleHomes({ logger });

    expect((await sub.status()).current).toBe('main');
    expect((await sub.getConfig('nzyme.refreshHome')).value).toBeNull();
    expect((await sub.getConfig('nzyme.refreshParent')).value).toBeNull();
});

test('a refresh whose starting branch no longer exists leaves the submodule where it is', async () => {
    const { mainPath, submodulePath } = await setupSubmoduleChain(true);
    process.chdir(mainPath);
    const sub = simpleGit({ baseDir: submodulePath });

    expect(await sync().catch((error: unknown) => error)).toBeInstanceOf(GitMergeConflictError);

    await sub.merge(['--abort']);
    await sub.deleteLocalBranch(UPPER, true);

    const { logger } = createTestLogger('refreshSubmoduleChain');
    await restoreSubmoduleHomes({ logger });

    expect((await sub.status()).current).toBe(LOWER);
    expect((await sub.getConfig('nzyme.refreshHome')).value).toBeNull();
});
