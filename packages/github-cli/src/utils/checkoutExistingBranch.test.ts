import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, test } from 'bun:test';
import { simpleGit } from 'simple-git';

import { UsageError } from '@nzyme/cli';
import { createTestLogger } from '@nzyme/logging';

import type { GithubConfig } from '../GithubConfig.js';
import { checkoutExistingBranch } from './checkoutExistingBranch.js';
import type { GithubClient } from './createGithubClient.js';

const GITHUB_CONFIG: GithubConfig = { owner: 'acme', repo: 'main', token: 'ghp_test' };
const BASE_BRANCHES = ['main'];

/**
 * A `GithubClient` stub that fails the test if called at all. The gitlink-SHA resolution this file
 * tests is entirely local git, and a submodule resting on a base branch has no pull request to look
 * up either - reaching GitHub in either case would itself be the defect.
 */
const THROWING_CLIENT: GithubClient = {
    rest: {
        pulls: {
            list() {
                throw new Error('pulls.list should not be called for this scenario');
            },
        },
    },
} as unknown as GithubClient;

/**
 * A `GithubClient` stub whose repository has no pull requests at all - the state nzyme's own `main`
 * is in. Only reached when the caller's base-branch list fails to classify the branch the submodule
 * rests on, which is precisely what the test below pins down.
 */
const NO_PRS_CLIENT: GithubClient = {
    rest: {
        pulls: {
            list() {
                return Promise.resolve({ data: [] });
            },
        },
    },
} as unknown as GithubClient;

/**
 * Build a superproject with one submodule that has two remote branches - `main` (base) and
 * `feat/thing` (task) - and two main-repo branches, `main` and `task-branch`, whose gitlinks record
 * the submodule's base tip and task tip respectively. Leaves the main repo checked out on `main`
 * and the submodule attached to its own `main`, clean, at `subBaseTip` - the common starting point
 * every test below adjusts from.
 *
 * Wired up by hand rather than with `git submodule add`, for the same two reasons
 * `syncAllRepos.test.ts` gives: recent git refuses a `file://` submodule without
 * `protocol.file.allow`, and `.gitmodules`' URL has to look like a GitHub remote for
 * `getSubmoduleGithubConfig` to resolve it - which is exactly what a real superproject's does.
 */
async function setupSuperproject(root: string): Promise<{
    mainPath: string;
    submodulePath: string;
    subBaseTip: string;
    subTaskTip: string;
}> {
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
    await seed.commit('sub c0', [], { '--allow-empty': null });
    await seed.push(['-u', 'origin', 'main']);

    // Branched off the shared ancestor, then `main` gets a commit of its own - so `main`'s tip is
    // never an ancestor of `feat/thing` (or vice versa) and `git branch -r --contains` resolves
    // either tip to exactly one branch, never both.
    await seed.checkoutBranch('feat/thing', 'main');
    await seed.commit('sub feature work', [], { '--allow-empty': null });
    const subTaskTip = (await seed.revparse(['HEAD'])).trim();
    await seed.push(['-u', 'origin', 'feat/thing']);

    await seed.checkout(['main']);
    await seed.commit('sub c1', [], { '--allow-empty': null });
    const subBaseTip = (await seed.revparse(['HEAD'])).trim();
    await seed.push(['origin', 'main']);

    await simpleGit().clone(mainRemote, mainPath);
    const main = simpleGit({ baseDir: mainPath });
    // Committing runs through `checkoutExistingBranch`'s own git instances, which carry no identity
    // of their own, so the identity has to live in the repository itself.
    await main.addConfig('user.email', 't@t');
    await main.addConfig('user.name', 't');
    await main.addConfig('commit.gpgsign', 'false');
    await main.checkoutLocalBranch('main');
    await main.commit('main c0', [], { '--allow-empty': null });
    await main.push(['-u', 'origin', 'main']);

    await simpleGit().clone(subRemote, submodulePath);
    const sub = simpleGit({ baseDir: submodulePath });
    await sub.addConfig('user.email', 't@t');
    await sub.addConfig('user.name', 't');
    await sub.addConfig('commit.gpgsign', 'false');

    writeFileSync(
        join(mainPath, '.gitmodules'),
        '[submodule "nzyme"]\n\tpath = nzyme\n\turl = https://github.com/acme/sub.git\n',
    );
    await main.add(['.gitmodules', 'nzyme']);
    await main.commit('add submodule at base tip');
    await main.push(['origin', 'main']);

    // A `task-branch` in the main repo whose gitlink records the submodule's task-branch tip,
    // without ever checking that commit out in the submodule working tree itself - a gitlink is
    // just a tree entry, and every test below decides independently what the submodule's own
    // checkout looks like when `checkoutExistingBranch` runs against it.
    await main.checkoutBranch('task-branch', 'main');
    await sub.checkout([subTaskTip]);
    await main.add(['nzyme']);
    await main.commit('pin submodule at feat/thing tip');
    await main.push(['-u', 'origin', 'task-branch']);

    await sub.checkout(['main']);
    await main.checkout(['main']);

    return { mainPath, submodulePath, subBaseTip, subTaskTip };
}

let root: string;
let originalCwd: string;

beforeEach(() => {
    originalCwd = process.cwd();
    root = mkdtempSync(join(tmpdir(), 'checkout-existing-branch-'));
});

afterEach(() => {
    process.chdir(originalCwd);
    rmSync(root, { recursive: true, force: true });
});

test('a dirty submodule on its base branch is refused unattended, and nothing is reset', async () => {
    const { mainPath, submodulePath } = await setupSuperproject(root);
    const sub = simpleGit({ baseDir: submodulePath });
    const headBefore = (await sub.revparse(['HEAD'])).trim();
    writeFileSync(join(submodulePath, 'dirty.txt'), 'work in progress\n');

    process.chdir(mainPath);
    const { logger } = createTestLogger('checkoutExistingBranch');

    const failure = checkoutExistingBranch({
        branchName: 'main',
        taskId: 'ABC-123',
        logger,
        githubClient: THROWING_CLIENT,
        githubConfig: GITHUB_CONFIG,
        baseBranch: 'main',
        baseBranches: BASE_BRANCHES,
        unattended: true,
    });

    await expect(failure).rejects.toThrow(UsageError);
    await expect(failure).rejects.toThrow(/uncommitted changes/);

    // The whole point: no `reset --hard` (or anything else) ran. The submodule's history and its
    // uncommitted file are exactly as they were before the call.
    expect((await sub.revparse(['HEAD'])).trim()).toBe(headBefore);
    expect(readFileSync(join(submodulePath, 'dirty.txt'), 'utf8')).toBe('work in progress\n');
    expect((await sub.status()).current).toBe('main');
});

test('a dirty submodule on its base branch is left in place with a warning when a human is present', async () => {
    const { mainPath, submodulePath } = await setupSuperproject(root);
    const sub = simpleGit({ baseDir: submodulePath });
    const headBefore = (await sub.revparse(['HEAD'])).trim();
    writeFileSync(join(submodulePath, 'dirty.txt'), 'work in progress\n');

    process.chdir(mainPath);
    const { logger, logs } = createTestLogger('checkoutExistingBranch');

    await checkoutExistingBranch({
        branchName: 'main',
        taskId: 'ABC-123',
        logger,
        githubClient: THROWING_CLIENT,
        githubConfig: GITHUB_CONFIG,
        baseBranch: 'main',
        baseBranches: BASE_BRANCHES,
        unattended: false,
    });

    // Reported, not silently skipped - but never moved: the submodule is exactly as it was, and the
    // run as a whole still succeeds instead of stopping dead on a submodule that is merely mid-flight.
    expect(logs.some(entry => entry.level === 'warn' && entry.message.includes('uncommitted changes'))).toBe(true);
    expect((await sub.revparse(['HEAD'])).trim()).toBe(headBefore);
    expect(readFileSync(join(submodulePath, 'dirty.txt'), 'utf8')).toBe('work in progress\n');
    expect((await sub.status()).current).toBe('main');
});

test('a submodule already on its base branch is fast-forwarded onto the fresh tip, not reset onto a stale one', async () => {
    const { mainPath, submodulePath } = await setupSuperproject(root);

    // Someone else pushes a new commit to the submodule's base branch after this checkout's clone
    // was made - the ordinary way a submodule ends up behind origin.
    const pusher = simpleGit({ baseDir: join(root, 'sub-seed') });
    writeFileSync(join(root, 'sub-seed', 'new-on-main.txt'), 'pushed after the clone\n');
    await pusher.add('new-on-main.txt');
    await pusher.commit('advance main');
    const newTip = (await pusher.revparse(['HEAD'])).trim();
    await pusher.push(['origin', 'main']);

    process.chdir(mainPath);
    const { logger } = createTestLogger('checkoutExistingBranch');

    await checkoutExistingBranch({
        branchName: 'main',
        taskId: 'ABC-123',
        logger,
        githubClient: THROWING_CLIENT,
        githubConfig: GITHUB_CONFIG,
        baseBranch: 'main',
        baseBranches: BASE_BRANCHES,
        unattended: true,
    });

    const sub = simpleGit({ baseDir: submodulePath });
    // The old `reset --hard` would have proven this too, but so would leaving the working tree
    // exactly where `update-ref` put it (ref moved, files untouched) - checking the file that only
    // exists on the new tip is what tells the two apart.
    expect((await sub.revparse(['HEAD'])).trim()).toBe(newTip);
    expect(readFileSync(join(submodulePath, 'new-on-main.txt'), 'utf8')).toBe('pushed after the clone\n');
    expect((await sub.status()).current).toBe('main');
});

test('a task branch is resolved straight from the gitlink SHA, with no PR lookup by task ID', async () => {
    const { mainPath, submodulePath, subTaskTip } = await setupSuperproject(root);

    process.chdir(mainPath);
    const { logger } = createTestLogger('checkoutExistingBranch');

    // `THROWING_CLIENT`: the submodule starts clean on its base branch, which `assertSubmoduleReady`
    // judges without any GitHub call, and resolving the target branch from the gitlink SHA is pure
    // git - reaching GitHub anywhere in this path would itself be the regression.
    await checkoutExistingBranch({
        branchName: 'task-branch',
        taskId: 'ABC-123',
        logger,
        githubClient: THROWING_CLIENT,
        githubConfig: GITHUB_CONFIG,
        baseBranch: 'main',
        baseBranches: BASE_BRANCHES,
        unattended: true,
    });

    const sub = simpleGit({ baseDir: submodulePath });
    const status = await sub.status();
    expect(status.current).toBe('feat/thing');
    expect((await sub.revparse(['HEAD'])).trim()).toBe(subTaskTip);
});

test("an empty base-branch list turns the submodule's own base branch into a task branch and refuses", async () => {
    const { mainPath, submodulePath } = await setupSuperproject(root);

    process.chdir(mainPath);
    const { logger } = createTestLogger('checkoutExistingBranch');

    // The same call as the fast-forward test above, with the base-branch list left empty - the shape
    // a caller that forgets to thread `baseBranches` used to produce silently. Nothing about the
    // submodule changes: it is clean, pushed, and resting on its own base branch. Only the
    // classification does, and that alone is enough to break the switch for every task afterwards.
    const failure = checkoutExistingBranch({
        branchName: 'main',
        taskId: 'ABC-123',
        logger,
        githubClient: NO_PRS_CLIENT,
        githubConfig: GITHUB_CONFIG,
        baseBranch: 'main',
        baseBranches: [],
        unattended: true,
    });

    await expect(failure).rejects.toThrow(UsageError);
    await expect(failure).rejects.toThrow(/is on main, which has no open pull request/);

    // Refused, not moved - the submodule stays exactly where the caller found it.
    const sub = simpleGit({ baseDir: submodulePath });
    expect((await sub.status()).current).toBe('main');
});
