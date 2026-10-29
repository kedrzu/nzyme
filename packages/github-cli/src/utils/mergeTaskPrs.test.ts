import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { SimpleGit } from 'simple-git';
import { simpleGit } from 'simple-git';

import { UsageError } from '@nzyme/cli';
import { createTestLogger } from '@nzyme/logging';

import type { GithubConfig } from '../GithubConfig.js';
import type { GithubClient } from './createGithubClient.js';
import { assertSubmodulesReady, mergeTaskPrs } from './mergeTaskPrs.js';
import { refreshMainAfterSubmoduleMerge } from './refreshMainAfterSubmoduleMerge.js';

const GITHUB_CONFIG: GithubConfig = { owner: 'acme', repo: 'main', token: 'ghp_test' };
const TRUNK = 'main';

/**
 * A submodule's own already-merged pull request, as `assertSubmodulesReady` should discover it.
 */
interface FakeMergedPr {
    branch: string;
    number: number;
}

/**
 * A `GithubClient` stub for the submodule's own repository: no open pull requests ever exist, and
 * `mergedPr` (if given) is the one closed, merged pull request `findMergedPrForBranch` can find.
 */
function createSubmoduleClient(mergedPr?: FakeMergedPr): GithubClient {
    return {
        rest: {
            pulls: {
                list(params: { state: string }) {
                    if (params.state !== 'closed' || !mergedPr) {
                        return Promise.resolve({ data: [] });
                    }

                    return Promise.resolve({
                        data: [
                            {
                                number: mergedPr.number,
                                title: 'submodule work',
                                state: 'closed',
                                merged_at: '2026-01-01T00:00:00Z',
                                updated_at: '2026-01-01T00:00:00Z',
                                head: { ref: mergedPr.branch },
                                base: { ref: 'main' },
                                draft: false,
                                html_url: `https://github.com/acme/sub/pull/${mergedPr.number}`,
                            },
                        ],
                    });
                },
            },
        },
    } as unknown as GithubClient;
}

/**
 * Build a superproject with one submodule whose gitlink SHA sits on a non-base task branch,
 * detached — the ordinary state for a gitlink-pinned submodule, and the state
 * `assertSubmodulesReady` must judge rather than skip (see `discoverSubmoduleTargets`'s doc for why
 * skipping a detached HEAD is exactly the regression this task replaces).
 *
 * Wired up by hand rather than with `git submodule add`, for the same reasons `syncAllRepos.test.ts`
 * gives: recent git refuses a `file://` submodule without `protocol.file.allow`, and the
 * `.gitmodules` URL has to look like a GitHub remote for `getSubmoduleGithubConfig` to resolve it.
 */
async function setupSuperprojectWithTaskSubmodule(
    root: string,
    taskBranch: string,
): Promise<{ mainPath: string; submodulePath: string; submoduleHeadBefore: string }> {
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
    await seed.checkoutBranch(taskBranch, 'main');
    await seed.commit('sub task work', [], { '--allow-empty': null });
    const taskTip = (await seed.revparse(['HEAD'])).trim();
    await seed.push(['-u', 'origin', taskBranch]);

    await simpleGit().clone(mainRemote, mainPath);
    const main = simpleGit({ baseDir: mainPath });
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
    await sub.fetch('origin');
    await sub.checkout(taskTip);

    writeFileSync(
        join(mainPath, '.gitmodules'),
        '[submodule "nzyme"]\n\tpath = nzyme\n\turl = https://github.com/acme/sub.git\n',
    );
    await main.add(['.gitmodules', 'nzyme']);
    await main.commit('add submodule');
    await main.push(['origin', 'main']);

    const submoduleHeadBefore = (await sub.revparse(['HEAD'])).trim();

    return { mainPath, submodulePath, submoduleHeadBefore };
}

let root: string;
let originalCwd: string;

beforeEach(() => {
    originalCwd = process.cwd();
    root = mkdtempSync(join(tmpdir(), 'merge-task-prs-'));
});

afterEach(() => {
    process.chdir(originalCwd);
    rmSync(root, { recursive: true, force: true });
});

// The must-protect case: a submodule left detached on a non-base branch with no open pull request
// must never let the merge through. Before this task, `mergeTaskPrs` had no per-submodule readiness
// check at all in this slot (`assertSubmodulesClean` only looked at `hasChanges`), so this state
// would have gone straight through to a main-repo merge with the submodule's own work left stranded.
test('refuses when a submodule sits on a non-base branch with no open pull request', async () => {
    const { mainPath, submodulePath, submoduleHeadBefore } = await setupSuperprojectWithTaskSubmodule(
        root,
        'feature/sig-777-thing',
    );
    const { logger } = createTestLogger('mergeTaskPrs');
    process.chdir(mainPath);

    const failure = assertSubmodulesReady({
        githubClient: createSubmoduleClient(),
        githubConfig: GITHUB_CONFIG,
        trunk: TRUNK,
        logger,
    });

    await expect(failure).rejects.toThrow(UsageError);
    await expect(failure).rejects.toThrow(/nzyme/);

    // The guard slot must stay free of mutation: the submodule is exactly where it was.
    const sub = simpleGit({ baseDir: submodulePath });
    expect((await sub.revparse(['HEAD'])).trim()).toBe(submoduleHeadBefore);
    expect((await sub.status()).detached).toBe(true);
});

// The other half of the same guard: a submodule whose branch's pull request already merged must be
// reported for parking, not refused — and, since this runs in the guard slot before
// `checkoutBottomNode`, must not itself touch the submodule's working tree. Parking happens later,
// at the call site next to `discoverSubmoduleTargets`.
test('collects a submodule whose pull request already merged, without touching its working tree', async () => {
    const taskBranch = 'feature/sig-888-thing';
    const { mainPath, submodulePath, submoduleHeadBefore } = await setupSuperprojectWithTaskSubmodule(root, taskBranch);
    const { logger } = createTestLogger('mergeTaskPrs');
    process.chdir(mainPath);

    const toPark = await assertSubmodulesReady({
        githubClient: createSubmoduleClient({ branch: taskBranch, number: 42 }),
        githubConfig: GITHUB_CONFIG,
        trunk: TRUNK,
        logger,
    });

    expect(toPark.map(submodule => submodule.name)).toEqual(['nzyme']);

    // Reported, not acted on: `assertSubmodulesReady` must not reset the submodule itself.
    const sub = simpleGit({ baseDir: submodulePath });
    expect((await sub.revparse(['HEAD'])).trim()).toBe(submoduleHeadBefore);
});

// `mergeTaskPrs` checks the bottom node out, then spends minutes on the confirm prompt and the
// submodule check polling before refreshing it. A branch switched in that window by another command
// in the worktree (here: an upper node) must be refused by name — never have `origin/main` merged
// into it and pushed, which would land the base merge in that node's diff and leave the bottom node's
// check gate waiting for a commit it never gets.
test('refresh refuses to merge base into a branch switched to after the bottom node was checked out', async () => {
    const { mainPath } = await setupSuperprojectWithTaskSubmodule(root, 'feature/sig-999-thing');
    const { logger } = createTestLogger('mergeTaskPrs');
    const main = simpleGit({ baseDir: mainPath });

    await main.branch(['node-1']);
    await main.branch(['node-2']);
    // Put `origin/main` ahead of both nodes so the refresh has a base merge to make.
    await main.commit('main moves on', [], { '--allow-empty': null });
    await main.push(['origin', 'main']);
    await main.checkout('node-2');
    const node2HeadBefore = (await main.revparse(['HEAD'])).trim();
    process.chdir(mainPath);

    const failure = refreshMainAfterSubmoduleMerge({
        taskBranch: 'node-1',
        refreshedSubmodulePaths: [],
        baseBranch: 'main',
        submoduleBase: { kind: 'trunk', trunk: TRUNK },
        // Never reached: the branch guard refuses before any upper-node lookup.
        githubClient: {} as GithubClient,
        githubConfig: GITHUB_CONFIG,
        logger,
    });

    await expect(failure).rejects.toThrow(UsageError);
    await expect(failure).rejects.toThrow(/from node-1 to node-2/);
    expect((await main.revparse(['HEAD'])).trim()).toBe(node2HeadBefore);
});

/**
 * A pull request on the fake GitHub below, in either repository.
 */
interface FakeRepoPr {
    repo: 'main' | 'sub';
    number: number;
    title: string;
    head: string;
    base: string;
    state: 'closed' | 'open';
}

/**
 * Parameters for {@link createFakeGithub}.
 */
interface CreateFakeGithubParams {
    /**
     * Bare remote of each repository, where head SHAs are read live — what GitHub itself reports.
     */
    remotes: Record<FakeRepoPr['repo'], string>;
    prs: FakeRepoPr[];
    /**
     * GitHub stacks, each as its pull request numbers in one repository, bottom to top.
     */
    stacks?: { repo: FakeRepoPr['repo']; number: number; prs: number[] }[];
    /**
     * Performs a squash merge on the remote, the part of GitHub's merge a test has to reproduce.
     */
    onMerge?: (pr: FakeRepoPr) => Promise<void>;
}

/**
 * A `GithubClient` stub serving both repositories of a superproject: every pull request in `prs`,
 * green checks on every head, the given `stacks` and no review threads. A stacked pull request refuses
 * the plain merge endpoint, as GitHub does, and merge-async lands it with every open node below it.
 * Records each merge as `<repo>#<number>`, in order.
 */
function createFakeGithub(params: CreateFakeGithubParams): { client: GithubClient; merged: string[] } {
    const { remotes, prs, stacks = [], onMerge } = params;
    const merged: string[] = [];

    function findStack(repo: string, number: number) {
        return stacks.find(stack => stack.repo === repo && stack.prs.includes(number));
    }

    async function land(pr: FakeRepoPr) {
        await onMerge?.(pr);
        pr.state = 'closed';
        merged.push(`${pr.repo}#${pr.number}`);
    }

    async function request(
        route: string,
        requestParams: { repo: string; pull_request?: number; pull_number?: number },
    ) {
        if (route === 'GET /repos/{owner}/{repo}/stacks') {
            const stack = findStack(requestParams.repo, requestParams.pull_request!);
            if (!stack) {
                return { status: 200, data: [] };
            }

            const nodes = await Promise.all(stack.prs.map(number => toApi(find(stack.repo, number))));
            return {
                status: 200,
                data: [{ number: stack.number, base: { ref: 'main' }, open: true, pull_requests: nodes }],
            };
        }

        if (route === 'PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge-async') {
            const stack = findStack(requestParams.repo, requestParams.pull_number!)!;
            for (const number of stack.prs.slice(0, stack.prs.indexOf(requestParams.pull_number!) + 1)) {
                const pr = find(stack.repo, number);
                if (pr.state === 'open') {
                    await land(pr);
                }
            }

            return { status: 202, data: { status: 'merged' } };
        }

        throw new Error(`Unexpected request ${route}`);
    }

    async function toApi(pr: FakeRepoPr) {
        const sha = (await simpleGit({ baseDir: remotes[pr.repo] }).revparse([pr.head])).trim();

        return {
            number: pr.number,
            title: pr.title,
            state: pr.state,
            merged_at: pr.state === 'closed' ? '2026-01-01T00:00:00Z' : null,
            updated_at: '2026-01-01T00:00:00Z',
            draft: false,
            html_url: `https://github.com/acme/${pr.repo}/pull/${pr.number}`,
            mergeable_state: 'clean',
            head: { ref: pr.head, sha },
            base: { ref: pr.base },
        };
    }

    function find(repo: string, number: number): FakeRepoPr {
        const pr = prs.find(candidate => candidate.repo === repo && candidate.number === number);
        if (!pr) {
            throw new Error(`No pull request ${repo}#${number}`);
        }

        return pr;
    }

    const client = {
        request,
        graphql: () => Promise.reject(new Error('no review threads here')),
        rest: {
            pulls: {
                list: async (listParams: { repo: string; state: string; base?: string }) => ({
                    data: await Promise.all(
                        prs
                            .filter(pr => pr.repo === listParams.repo && pr.state === listParams.state)
                            .filter(pr => !listParams.base || pr.base === listParams.base)
                            .map(toApi),
                    ),
                }),
                get: async (getParams: { repo: string; pull_number: number }) => ({
                    data: await toApi(find(getParams.repo, getParams.pull_number)),
                }),
                merge: async (mergeParams: { repo: string; pull_number: number }) => {
                    if (findStack(mergeParams.repo, mergeParams.pull_number)) {
                        throw new Error('Merging stacked PRs via this endpoint is not supported.');
                    }

                    await land(find(mergeParams.repo, mergeParams.pull_number));
                    return { data: { merged: true } };
                },
            },
            checks: {
                listForRef: () =>
                    Promise.resolve({
                        data: {
                            check_runs: [{ name: 'ci', status: 'completed', conclusion: 'success', html_url: '' }],
                        },
                    }),
            },
            repos: {
                getCombinedStatusForRef: () => Promise.resolve({ data: { statuses: [] } }),
            },
        },
    } as unknown as GithubClient;

    return { client, merged };
}

/**
 * Parameters for {@link setupMergeScenario}.
 */
interface SetupMergeScenarioParams {
    /**
     * Branch of the submodule's own repository its pin sits on, one commit off its `main`.
     */
    subBranch: string;

    /**
     * Product branch the task branch `abc-1-work` is cut from — the branch its pull request lands on.
     */
    productBase: string;
}

/**
 * Build a product whose `main` and `release` pin the submodule at its `main`, and a task branch
 * `abc-1-work` cut from `productBase` that pins the submodule at the tip of `subBranch` instead —
 * pushed, clean, and checked out with the submodule detached at that pin, ready to merge.
 */
async function setupMergeScenario(
    dir: string,
    params: SetupMergeScenarioParams,
): Promise<{
    mainPath: string;
    submodulePath: string;
    subSeed: string;
    remotes: CreateFakeGithubParams['remotes'];
    pin: string;
}> {
    const { subBranch, productBase } = params;
    const remotes = { main: join(dir, 'origin-main.git'), sub: join(dir, 'origin-sub.git') };
    const subSeed = join(dir, 'sub-seed');
    const mainPath = join(dir, 'main');
    const submodulePath = join(mainPath, 'nzyme');

    const bare = simpleGit();
    for (const remote of Object.values(remotes)) {
        await bare.init(['--bare', remote]);
        await bare.cwd(remote).raw(['symbolic-ref', 'HEAD', 'refs/heads/main']);
    }

    await simpleGit().clone(remotes.sub, subSeed);
    const seed = simpleGit({ baseDir: subSeed, config: ['user.email=t@t', 'user.name=t', 'commit.gpgsign=false'] });
    await seed.checkoutLocalBranch('main');
    await seed.commit('sub c0', [], { '--allow-empty': null });
    await seed.push(['-u', 'origin', 'main']);
    await seed.checkoutBranch(subBranch, 'main');
    writeFileSync(join(subSeed, 'sub-work.txt'), `${subBranch}\n`);
    await seed.add(['.']);
    await seed.commit(`work on ${subBranch}`);
    const pin = (await seed.revparse(['HEAD'])).trim();
    await seed.push(['-u', 'origin', subBranch]);
    await seed.checkout('main');

    await simpleGit().clone(remotes.main, mainPath);
    const main = simpleGit({ baseDir: mainPath });
    await main.addConfig('user.email', 't@t');
    await main.addConfig('user.name', 't');
    await main.addConfig('commit.gpgsign', 'false');
    await main.checkoutLocalBranch('main');
    await main.commit('main c0', [], { '--allow-empty': null });

    await simpleGit().clone(remotes.sub, submodulePath);
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
    await main.commit('add submodule');
    await main.push(['-u', 'origin', 'main']);
    await main.branch(['release']);
    await main.push(['-u', 'origin', 'release']);

    await main.checkoutBranch('abc-1-work', productBase);
    await sub.checkout([pin]);
    await main.add(['nzyme']);
    await main.commit('pin submodule work');
    await main.push(['-u', 'origin', 'abc-1-work']);

    return { mainPath, submodulePath, subSeed, remotes, pin };
}

test('a task landing on the trunk merges its submodule pull request first and re-points the gitlink', async () => {
    const { mainPath, submodulePath, subSeed, remotes } = await setupMergeScenario(root, {
        subBranch: 'feat/thing',
        productBase: 'main',
    });
    const seed = simpleGit({ baseDir: subSeed, config: ['user.email=t@t', 'user.name=t', 'commit.gpgsign=false'] });
    const { client, merged } = createFakeGithub({
        remotes,
        prs: [
            { repo: 'main', number: 10, title: '[ABC-1] Work', head: 'abc-1-work', base: 'main', state: 'open' },
            { repo: 'sub', number: 5, title: 'feat: thing', head: 'feat/thing', base: 'main', state: 'open' },
        ],
        onMerge: async pr => {
            if (pr.repo !== 'sub') {
                return;
            }

            await seed.raw(['merge', '--squash', `origin/${pr.head}`]);
            await seed.commit(pr.title);
            await seed.push(['origin', 'main']);
        },
    });
    const { logger } = createTestLogger('mergeTaskPrs');
    process.chdir(mainPath);

    await mergeTaskPrs({
        githubClient: client,
        githubConfig: GITHUB_CONFIG,
        issueId: 'ABC-1',
        baseBranch: 'main',
        logger,
        autoYes: true,
        checkPollIntervalMs: 0,
    });

    const squashed = (await seed.revparse(['main'])).trim();
    expect(merged).toEqual(['sub#5', 'main#10']);
    expect((await simpleGit({ baseDir: submodulePath }).revparse(['HEAD'])).trim()).toBe(squashed);
    expect((await simpleGit({ baseDir: remotes.main }).raw(['rev-parse', 'abc-1-work:nzyme'])).trim()).toBe(squashed);
});

// The submodule work is itself a GitHub stack, pinned at its top node. GitHub refuses the plain merge
// endpoint for a stacked pull request, so the merge goes through merge-async, which lands the pinned
// node with the node below it.
test('a task whose submodule work is a stack merges that stack before the product pull request', async () => {
    const { mainPath, submodulePath, subSeed, remotes } = await setupMergeScenario(root, {
        subBranch: 'feat/top',
        productBase: 'main',
    });
    const seed = simpleGit({ baseDir: subSeed, config: ['user.email=t@t', 'user.name=t', 'commit.gpgsign=false'] });
    await seed.push(['origin', 'main:refs/heads/feat/bottom']);
    const { client, merged } = createFakeGithub({
        remotes,
        prs: [
            { repo: 'main', number: 10, title: '[ABC-1] Work', head: 'abc-1-work', base: 'main', state: 'open' },
            { repo: 'sub', number: 4, title: 'fix: bottom', head: 'feat/bottom', base: 'main', state: 'open' },
            { repo: 'sub', number: 5, title: 'feat: top', head: 'feat/top', base: 'feat/bottom', state: 'open' },
        ],
        stacks: [{ repo: 'sub', number: 1, prs: [4, 5] }],
        onMerge: async pr => {
            if (pr.repo !== 'sub' || pr.number !== 5) {
                return;
            }

            await seed.raw(['merge', '--squash', `origin/${pr.head}`]);
            await seed.commit(pr.title);
            await seed.push(['origin', 'main']);
        },
    });
    const { logger } = createTestLogger('mergeTaskPrs');
    process.chdir(mainPath);

    await mergeTaskPrs({
        githubClient: client,
        githubConfig: GITHUB_CONFIG,
        issueId: 'ABC-1',
        baseBranch: 'main',
        logger,
        autoYes: true,
        checkPollIntervalMs: 0,
    });

    const squashed = (await seed.revparse(['main'])).trim();
    expect(merged).toEqual(['sub#4', 'sub#5', 'main#10']);
    expect((await simpleGit({ baseDir: submodulePath }).revparse(['HEAD'])).trim()).toBe(squashed);
    expect((await simpleGit({ baseDir: remotes.main }).raw(['rev-parse', 'abc-1-work:nzyme'])).trim()).toBe(squashed);
});

// A hotfix into the product's `release` whose pin sits on nzyme's own `release` line, which has an
// open pull request of its own (nzyme's release merging back into its `main`). Before the
// trunk-or-pin rule the merge read that pull request as the task's submodule work: it squash-merged
// nzyme's release PR and re-pointed the hotfix's gitlink at nzyme's `main`, a commit the product's
// `main` had never run.
test('a task that does not land on the trunk merges only the product pull request and keeps the pin', async () => {
    const { mainPath, submodulePath, remotes, pin } = await setupMergeScenario(root, {
        subBranch: 'release',
        productBase: 'release',
    });
    const { client, merged } = createFakeGithub({
        remotes,
        prs: [
            { repo: 'main', number: 10, title: '[ABC-1] Hotfix', head: 'abc-1-work', base: 'release', state: 'open' },
            {
                repo: 'sub',
                number: 5,
                title: 'chore: merge release into main',
                head: 'release',
                base: 'main',
                state: 'open',
            },
        ],
    });
    const { logger } = createTestLogger('mergeTaskPrs');
    process.chdir(mainPath);

    await mergeTaskPrs({
        githubClient: client,
        githubConfig: GITHUB_CONFIG,
        issueId: 'ABC-1',
        baseBranch: 'main',
        logger,
        autoYes: true,
        checkPollIntervalMs: 0,
    });

    expect(merged).toEqual(['main#10']);
    expect((await simpleGit({ baseDir: submodulePath }).revparse(['HEAD'])).trim()).toBe(pin);
    expect((await simpleGit({ baseDir: remotes.main }).raw(['rev-parse', 'abc-1-work:nzyme'])).trim()).toBe(pin);
});

// Both product lines move on before a hotfix into `release` merges. The pre-merge refresh has to take
// in `release`, never `main`: merging `main` into the hotfix would land all of it — submodule pins
// included — on `release` with the squash.
test('a task that does not land on the trunk is refreshed with the branch it lands on, not the trunk', async () => {
    const { mainPath, remotes } = await setupMergeScenario(root, { subBranch: 'release', productBase: 'release' });
    const main = simpleGit({ baseDir: mainPath });
    const tips: Record<string, string> = {};
    for (const branch of ['main', 'release']) {
        await main.checkout(branch);
        await main.commit(`${branch} moves on`, [], { '--allow-empty': null });
        await main.push(['origin', branch]);
        tips[branch] = (await main.revparse(['HEAD'])).trim();
    }
    await main.checkout('abc-1-work');
    const { client, merged } = createFakeGithub({
        remotes,
        prs: [
            { repo: 'main', number: 10, title: '[ABC-1] Hotfix', head: 'abc-1-work', base: 'release', state: 'open' },
        ],
    });
    const { logger } = createTestLogger('mergeTaskPrs');
    process.chdir(mainPath);

    await mergeTaskPrs({
        githubClient: client,
        githubConfig: GITHUB_CONFIG,
        issueId: 'ABC-1',
        baseBranch: 'main',
        logger,
        autoYes: true,
        checkPollIntervalMs: 0,
    });

    const remote = simpleGit({ baseDir: remotes.main });
    expect(merged).toEqual(['main#10']);
    expect(await isAncestor(remote, tips.release!, 'abc-1-work')).toBe(true);
    expect(await isAncestor(remote, tips.main!, 'abc-1-work')).toBe(false);
});

/**
 * Whether `commit` is in the history of `of`. Read from the merge base because `merge-base
 * --is-ancestor` answers through its exit code alone, which simple-git does not reject on.
 */
async function isAncestor(git: SimpleGit, commit: string, of: string): Promise<boolean> {
    return (await git.raw(['merge-base', commit, of])).trim() === commit;
}
