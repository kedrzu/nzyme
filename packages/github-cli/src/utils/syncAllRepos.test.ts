import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, test } from 'bun:test';
import { simpleGit } from 'simple-git';

import { UsageError } from '@nzyme/cli';
import { createTestLogger } from '@nzyme/logging';

import type { GithubConfig } from '../GithubConfig.js';
import type { GithubClient } from './createGithubClient.js';
import type { SubmoduleBase } from './resolveSubmoduleBase.js';
import { syncAllRepos } from './syncAllRepos.js';

const GITHUB_CONFIG: GithubConfig = { owner: 'acme', repo: 'main', token: 'ghp_test' };
const FOLLOW_MAIN: SubmoduleBase = { kind: 'trunk', trunk: 'main' };

/**
 * A `GithubClient` stub that fails the test if called at all. A submodule resting on a base branch
 * has no pull request to look up, so reaching GitHub here would itself be the defect.
 */
const THROWING_CLIENT: GithubClient = {
    rest: {
        pulls: {
            list() {
                throw new Error('pulls.list should not be called while the submodule is on a base branch');
            },
        },
    },
} as unknown as GithubClient;

/**
 * Build a superproject on `main` with one submodule, both cloned from their own bare origins, then
 * dirty both working trees: an uncommitted file in the main repository and another inside the
 * submodule.
 *
 * The submodule is wired up by hand rather than with `git submodule add` for two reasons: recent
 * git refuses a `file://` submodule without `protocol.file.allow`, and its `.gitmodules` URL has to
 * look like a GitHub remote for `getSubmoduleGithubConfig` to resolve it — which is exactly what a
 * real superproject's does.
 */
async function setupSuperproject(root: string): Promise<{ mainPath: string; submodulePath: string }> {
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
    const seed = simpleGit({ baseDir: subSeed, config: ['user.email=t@t', 'user.name=t'] });
    await seed.checkoutLocalBranch('main');
    await seed.commit('sub c0', [], { '--allow-empty': null });
    await seed.push(['-u', 'origin', 'main']);

    await simpleGit().clone(mainRemote, mainPath);
    const main = simpleGit({ baseDir: mainPath });
    // Committing runs through `syncAllRepos`' own git instances, which carry no identity of their
    // own, so the identity has to live in the repository itself.
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
    await main.commit('add submodule');
    await main.push(['origin', 'main']);

    writeFileSync(join(mainPath, 'main-work.txt'), 'work in the main repository\n');
    writeFileSync(join(submodulePath, 'sub-work.txt'), 'work in the submodule\n');

    return { mainPath, submodulePath };
}

let root: string;
let originalCwd: string;

beforeEach(() => {
    originalCwd = process.cwd();
    root = mkdtempSync(join(tmpdir(), 'sync-all-repos-'));
});

afterEach(() => {
    process.chdir(originalCwd);
    rmSync(root, { recursive: true, force: true });
});

test('a dirty submodule is refused rather than committed when nobody can be asked', async () => {
    const { mainPath, submodulePath } = await setupSuperproject(root);
    const { logger } = createTestLogger('syncAllRepos');
    const sub = simpleGit({ baseDir: submodulePath });
    const headBefore = (await sub.revparse(['HEAD'])).trim();

    process.chdir(mainPath);

    const failure = syncAllRepos({
        branch: 'main',
        baseBranch: 'main',
        submoduleBase: FOLLOW_MAIN,
        unattended: true,
        githubClient: THROWING_CLIENT,
        githubConfig: GITHUB_CONFIG,
        logger,
        defaultCommitMessage: '[ABC-123] Work in progress',
    });

    await expect(failure).rejects.toThrow(UsageError);
    await expect(failure).rejects.toThrow(/nzyme/);

    // The whole point: the submodule's history is untouched and its work is still sitting in the
    // working tree, for its own repository's conventions to commit under its own message.
    expect((await sub.revparse(['HEAD'])).trim()).toBe(headBefore);
    expect((await sub.status()).files.map(file => file.path)).toEqual(['sub-work.txt']);
});

test('the main repository is still committed automatically before the submodule is judged', async () => {
    const { mainPath } = await setupSuperproject(root);
    const { logger } = createTestLogger('syncAllRepos');
    const main = simpleGit({ baseDir: mainPath });
    const headBefore = (await main.revparse(['HEAD'])).trim();

    process.chdir(mainPath);

    const failure = syncAllRepos({
        branch: 'main',
        baseBranch: 'main',
        submoduleBase: FOLLOW_MAIN,
        unattended: true,
        githubClient: THROWING_CLIENT,
        githubConfig: GITHUB_CONFIG,
        logger,
        defaultCommitMessage: '[ABC-123] Work in progress',
    });

    await expect(failure).rejects.toThrow(UsageError);

    expect((await main.revparse(['HEAD'])).trim()).not.toBe(headBefore);
    // The message is generated, not the bare default: it names what actually changed
    // (main-work.txt and the submodule gitlink update) alongside the caller's default.
    expect((await main.log(['-1'])).latest?.message).toBe('[ABC-123] Work in progress: main-work.txt and nzyme');
});

const STACK = ['feature/abc-1-stack', 'feature/abc-1-stack--s2', 'feature/abc-1-stack--s3'] as const;

/**
 * Build a three-node stack on `main` — each node one commit on top of the node below — push it, and
 * leave the top node checked out. No submodules, so the sync talks to GitHub only through the
 * stack's own pull requests.
 */
async function setupStack(dir: string): Promise<{ mainPath: string; remotePath: string }> {
    const remotePath = join(dir, 'origin-main.git');
    const mainPath = join(dir, 'main');

    const bare = simpleGit();
    await bare.init(['--bare', remotePath]);
    await bare.cwd(remotePath).raw(['symbolic-ref', 'HEAD', 'refs/heads/main']);

    await simpleGit().clone(remotePath, mainPath);
    const main = simpleGit({ baseDir: mainPath });
    await main.addConfig('user.email', 't@t');
    await main.addConfig('user.name', 't');
    await main.addConfig('commit.gpgsign', 'false');
    await main.checkoutLocalBranch('main');
    await main.commit('main c0', [], { '--allow-empty': null });
    await main.push(['-u', 'origin', 'main']);

    for (const node of STACK) {
        await main.checkoutLocalBranch(node);
        writeFileSync(join(mainPath, `${node.replaceAll('/', '-')}.txt`), `${node}\n`);
        await main.add(['.']);
        await main.commit(`work on ${node}`);
        await main.push(['-u', 'origin', node]);
    }

    return { mainPath, remotePath };
}

/**
 * A `GithubClient` stub serving the stack's open pull requests, each node based on the one below it,
 * with head SHAs read from the remote — what GitHub itself would report.
 */
async function createStackClient(remotePath: string): Promise<GithubClient> {
    const remote = simpleGit({ baseDir: remotePath });
    const prs = await Promise.all(
        STACK.map(async (node, index) => ({
            number: index + 1,
            state: 'open',
            title: `[ABC-1] node ${index + 1}`,
            head: { ref: node, sha: (await remote.revparse([node])).trim() },
            base: { ref: index === 0 ? 'main' : STACK[index - 1] },
        })),
    );

    return {
        rest: {
            pulls: {
                list: (params: { base?: string }) =>
                    Promise.resolve({ data: prs.filter(pr => !params.base || pr.base.ref === params.base) }),
            },
        },
    } as unknown as GithubClient;
}

test('a sync whose worktree is switched to another node mid-run never merges into or pushes that node', async () => {
    // HLD-585: `task push` on the top node synced against its base (the middle node) while another
    // command in the same worktree checked out the bottom node. The push's base merge then landed on
    // the bottom node and pushed it — a fast-forward onto the middle node's head, which GitHub reads
    // as the middle pull request being merged.
    const { mainPath, remotePath } = await setupStack(root);
    const githubClient = await createStackClient(remotePath);
    const remote = simpleGit({ baseDir: remotePath });
    const bottomBefore = (await remote.revparse([STACK[0]])).trim();
    const { logger } = createTestLogger('syncAllRepos');

    // The other command, switching the shared working tree between the sync's phases.
    let switched = false;
    const switchingLogger = {
        ...logger,
        info: (message: string) => {
            if (!switched && message.includes('Fast-forwarding base branches')) {
                switched = true;
                Bun.spawnSync(['git', 'checkout', '--quiet', STACK[0]], { cwd: mainPath });
            }

            logger.info(message);
        },
    };

    process.chdir(mainPath);

    const sync = syncAllRepos({
        branch: STACK[2],
        baseBranch: STACK[1],
        submoduleBase: FOLLOW_MAIN,
        unattended: true,
        githubClient,
        githubConfig: GITHUB_CONFIG,
        logger: switchingLogger,
    });

    await expect(sync).rejects.toThrow(UsageError);
    await expect(sync).rejects.toThrow(STACK[0]);

    expect(switched).toBe(true);
    expect((await remote.revparse([STACK[0]])).trim()).toBe(bottomBefore);
    expect((await simpleGit({ baseDir: mainPath }).revparse([STACK[0]])).trim()).toBe(bottomBefore);
});

test('a sync that would merge an upper node into the node below it refuses to push that node', async () => {
    // Standing on the bottom node with the middle node as the merge source is the shape the incident
    // left behind. Whatever call path produces it, the push has to stop by name before GitHub reads
    // the middle pull request as merged.
    const { mainPath, remotePath } = await setupStack(root);
    const githubClient = await createStackClient(remotePath);
    const remote = simpleGit({ baseDir: remotePath });
    const bottomBefore = (await remote.revparse([STACK[0]])).trim();
    const { logger } = createTestLogger('syncAllRepos');

    await simpleGit({ baseDir: mainPath }).checkout(STACK[0]);
    process.chdir(mainPath);

    const sync = syncAllRepos({
        branch: STACK[0],
        baseBranch: STACK[1],
        submoduleBase: FOLLOW_MAIN,
        unattended: true,
        githubClient,
        githubConfig: GITHUB_CONFIG,
        logger,
    });

    await expect(sync).rejects.toThrow(UsageError);
    await expect(sync).rejects.toThrow(`Refusing to push ${STACK[0]}: it now contains the head of ${STACK[1]}`);

    expect((await remote.revparse([STACK[0]])).trim()).toBe(bottomBefore);
});

test('a sync whose worktree is already on another node refuses before committing anything to it', async () => {
    // The caller derived the base from the node it read (the top), but the worktree was switched to
    // the bottom node before the sync started. Even the auto-commit has to stop: committing the
    // developer's work onto the bottom node is the first step of the same damage.
    const { mainPath, remotePath } = await setupStack(root);
    const githubClient = await createStackClient(remotePath);
    const main = simpleGit({ baseDir: mainPath });
    const { logger } = createTestLogger('syncAllRepos');

    await main.checkout(STACK[0]);
    const bottomBefore = (await main.revparse([STACK[0]])).trim();
    writeFileSync(join(mainPath, 'top-node-work.txt'), 'work meant for the top node\n');
    process.chdir(mainPath);

    const sync = syncAllRepos({
        branch: STACK[2],
        baseBranch: STACK[1],
        submoduleBase: FOLLOW_MAIN,
        unattended: true,
        githubClient,
        githubConfig: GITHUB_CONFIG,
        logger,
    });

    await expect(sync).rejects.toThrow(`The working tree switched from ${STACK[2]} to ${STACK[0]}`);

    expect((await main.revparse([STACK[0]])).trim()).toBe(bottomBefore);
    expect((await main.status()).not_added).toEqual(['top-node-work.txt']);
});

/**
 * A `GithubClient` stub for a branch nothing is stacked on: the only call the sync makes in these
 * scenarios is the upper-node lookup before a push, and it finds none.
 */
const NO_UPPER_NODES_CLIENT: GithubClient = {
    rest: {
        pulls: {
            list: () => Promise.resolve({ data: [] }),
        },
    },
} as unknown as GithubClient;

/**
 * A product branch to cut from an existing one, with one commit of its own, and push.
 */
interface ProductBranch {
    name: string;
    from: string;
}

/**
 * Build a product whose `main` and `release` both pin the submodule at `pin` — the tip of the
 * submodule's `main` at the time — with the submodule checked out detached at that pin, the way
 * `git submodule update` leaves it. Then move the submodule's origin on after the clone: its `main`
 * gains a commit, and its own `release` line (nzyme's npm release branch — a branch of the
 * submodule's repository that merely shares the product branch's name) gains another.
 */
async function setupMovedSubmodule(
    dir: string,
    branches: ProductBranch[],
): Promise<{ mainPath: string; submodulePath: string; pin: string; subMainTip: string }> {
    const mainRemote = join(dir, 'origin-main.git');
    const subRemote = join(dir, 'origin-sub.git');
    const subSeed = join(dir, 'sub-seed');
    const mainPath = join(dir, 'main');
    const submodulePath = join(mainPath, 'nzyme');

    const bare = simpleGit();
    await bare.init(['--bare', mainRemote]);
    await bare.cwd(mainRemote).raw(['symbolic-ref', 'HEAD', 'refs/heads/main']);
    await bare.init(['--bare', subRemote]);
    await bare.cwd(subRemote).raw(['symbolic-ref', 'HEAD', 'refs/heads/main']);

    await simpleGit().clone(subRemote, subSeed);
    const seed = simpleGit({ baseDir: subSeed, config: ['user.email=t@t', 'user.name=t', 'commit.gpgsign=false'] });
    await seed.checkoutLocalBranch('main');
    await seed.commit('sub c0', [], { '--allow-empty': null });
    const pin = (await seed.revparse(['HEAD'])).trim();
    await seed.push(['-u', 'origin', 'main']);

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
    await sub.checkout(['--detach']);

    writeFileSync(
        join(mainPath, '.gitmodules'),
        '[submodule "nzyme"]\n\tpath = nzyme\n\turl = https://github.com/acme/sub.git\n',
    );
    await main.add(['.gitmodules', 'nzyme']);
    await main.commit('pin submodule');
    await main.push(['-u', 'origin', 'main']);
    await main.branch(['release']);
    await main.push(['-u', 'origin', 'release']);

    for (const branch of branches) {
        await main.checkoutBranch(branch.name, branch.from);
        writeFileSync(join(mainPath, `${branch.name.replaceAll('/', '-')}.txt`), `${branch.name}\n`);
        await main.add(['.']);
        await main.commit(`work on ${branch.name}`);
        await main.push(['-u', 'origin', branch.name]);
    }

    await seed.commit('sub c1 on main', [], { '--allow-empty': null });
    const subMainTip = (await seed.revparse(['HEAD'])).trim();
    await seed.push(['origin', 'main']);
    await seed.checkoutBranch('release', pin);
    await seed.commit('chore(release): v1.0.0', [], { '--allow-empty': null });
    await seed.push(['-u', 'origin', 'release']);

    return { mainPath, submodulePath, pin, subMainTip };
}

// A hotfix into the product's `release` must leave the submodule exactly where `release` pins it.
// Before the trunk-or-pin rule, the sync took the PR base (`release`) as the submodule base too:
// it fetched the submodule's own `release`, parked the detached submodule on it, and committed that
// gitlink into the hotfix — shipping an nzyme commit the product's `main` had never run.
test('a branch that does not land on the trunk leaves the submodule on its pin: nothing fetched, parked or re-pointed', async () => {
    const { mainPath, submodulePath, pin } = await setupMovedSubmodule(root, [
        { name: 'abc-1-hotfix', from: 'release' },
    ]);
    const main = simpleGit({ baseDir: mainPath });
    const remoteHeadBefore = (await main.revparse(['origin/abc-1-hotfix'])).trim();
    const { logger } = createTestLogger('syncAllRepos');
    process.chdir(mainPath);

    await syncAllRepos({
        branch: 'abc-1-hotfix',
        baseBranch: 'release',
        submoduleBase: { kind: 'pin', trunk: 'main', landingTrunk: 'release' },
        unattended: true,
        githubClient: NO_UPPER_NODES_CLIENT,
        githubConfig: GITHUB_CONFIG,
        logger,
    });

    const sub = simpleGit({ baseDir: submodulePath });
    expect((await sub.revparse(['HEAD'])).trim()).toBe(pin);
    expect((await sub.status()).detached).toBe(true);
    // Not even fetched: the submodule's view of its origin is the one it was cloned with.
    expect((await sub.revparse(['origin/main'])).trim()).toBe(pin);
    expect((await sub.raw(['branch', '-r', '--list', 'origin/release'])).trim()).toBe('');

    await main.fetch('origin');
    expect((await main.revparse(['origin/abc-1-hotfix'])).trim()).toBe(remoteHeadBefore);
    expect((await main.raw(['rev-parse', 'origin/abc-1-hotfix:nzyme'])).trim()).toBe(pin);
});

// An upper node's merge source is the node below it, a branch the submodule's repository does not
// have. Its submodule still follows the trunk the whole chain lands on — the same as the bottom
// node's — rather than being synced with a node branch that resolves to nothing.
test('an upper stack node syncs its submodule with the trunk, not with the node below it', async () => {
    const { mainPath, submodulePath, subMainTip } = await setupMovedSubmodule(root, [
        { name: 'abc-3-stack', from: 'main' },
        { name: 'abc-3-stack--s2', from: 'abc-3-stack' },
    ]);
    const { logger } = createTestLogger('syncAllRepos');
    process.chdir(mainPath);

    await syncAllRepos({
        branch: 'abc-3-stack--s2',
        baseBranch: 'abc-3-stack',
        submoduleBase: FOLLOW_MAIN,
        unattended: true,
        githubClient: NO_UPPER_NODES_CLIENT,
        githubConfig: GITHUB_CONFIG,
        logger,
    });

    const sub = simpleGit({ baseDir: submodulePath });
    expect((await sub.status()).current).toBe('main');
    expect((await sub.revparse(['HEAD'])).trim()).toBe(subMainTip);

    const main = simpleGit({ baseDir: mainPath });
    await main.fetch('origin');
    expect((await main.raw(['rev-parse', 'origin/abc-3-stack--s2:nzyme'])).trim()).toBe(subMainTip);
});
