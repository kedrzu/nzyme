import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, test } from 'bun:test';
import { simpleGit } from 'simple-git';
import type { SimpleGit } from 'simple-git';

import { UsageError } from '@nzyme/cli';

import type { GithubConfig } from '../GithubConfig.js';
import { assertSubmoduleReady } from './assertSubmoduleReady.js';
import type { GithubClient } from './createGithubClient.js';
import type { SubmoduleInfo } from './getSubmoduleInfo.js';

const BASE_BRANCHES = ['main'];
const GITHUB_CONFIG: GithubConfig = { owner: 'acme', repo: 'sub', token: 'ghp_test' };

/**
 * Build a `SubmoduleInfo` with sensible defaults, overriding only what a test cares about.
 */
function buildSubmodule(overrides: Partial<SubmoduleInfo> & { path: string }): SubmoduleInfo {
    return {
        name: 'sub',
        url: 'https://github.com/acme/sub.git',
        hasChanges: false,
        detached: false,
        unpushedCommitsCount: 0,
        hasRemoteBranch: true,
        ...overrides,
    };
}

interface FakePr {
    number: number;
    branch: string;
    state: 'open' | 'closed';
    mergedAt?: string | null;
}

/**
 * A `GithubClient` stub whose `pulls.list` answers from a fixed list of PRs, split by `state` the
 * way the real endpoint does.
 */
function createPrClient(prs: FakePr[]): GithubClient {
    return {
        rest: {
            pulls: {
                list(listParams: { state: string }) {
                    return Promise.resolve({
                        data: prs
                            .filter(pr => pr.state === listParams.state)
                            .map(pr => ({
                                number: pr.number,
                                head: { ref: pr.branch },
                                merged_at: pr.mergedAt ?? null,
                            })),
                    });
                },
            },
        },
    } as unknown as GithubClient;
}

/**
 * A `GithubClient` stub that fails the test if called at all — used to prove the base-branch path
 * makes no GitHub API call.
 */
const THROWING_CLIENT: GithubClient = {
    rest: {
        pulls: {
            list() {
                throw new Error('pulls.list should not be called while on a base branch');
            },
        },
    },
} as unknown as GithubClient;

/**
 * Build a tiny git repo with a bare origin: a `main` base branch with one commit (`baseTip`), a
 * `shared` commit reachable from both `branchA` and `branchB` (ambiguous), a `divergedTip` commit
 * reachable only from `branchA` (an unambiguous single task branch), and an `orphanSha` commit that
 * is never pushed anywhere — reachable from no remote branch at all. Mirrors how a submodule's
 * gitlink SHA relates to its remote branches, plus the one shape a submodule branch cannot answer:
 * work that exists only in the local checkout.
 */
async function setupRepo(root: string): Promise<{
    work: SimpleGit;
    workPath: string;
    baseTip: string;
    shared: string;
    divergedTip: string;
    orphanSha: string;
}> {
    const remote = join(root, 'origin.git');
    const seed = join(root, 'seed');
    const workPath = join(root, 'work');

    const bare = simpleGit();
    await bare.init(['--bare', remote]);
    await bare.cwd(remote).raw(['symbolic-ref', 'HEAD', 'refs/heads/main']);

    await simpleGit().clone(remote, seed);
    const s = simpleGit({ baseDir: seed, config: ['user.email=t@t', 'user.name=t'] });
    await s.checkoutLocalBranch('main');
    await s.commit('c0', [], { '--allow-empty': null });
    const shared = (await s.revparse(['HEAD'])).trim();
    await s.push(['-u', 'origin', 'main']);

    await s.checkoutBranch('branchA', 'main');
    await s.commit('a1', [], { '--allow-empty': null });
    const divergedTip = (await s.revparse(['HEAD'])).trim();
    await s.push(['-u', 'origin', 'branchA']);

    await s.checkout(['main']);
    await s.checkoutBranch('branchB', 'main');
    await s.commit('b1', [], { '--allow-empty': null });
    await s.push(['-u', 'origin', 'branchB']);

    await s.checkout(['main']);
    await s.commit('c1', [], { '--allow-empty': null });
    const baseTip = (await s.revparse(['HEAD'])).trim();
    await s.push(['origin', 'main']);

    await simpleGit().clone(remote, workPath);
    const work = simpleGit({ baseDir: workPath, config: ['user.email=t@t', 'user.name=t'] });

    // A commit that lives only on a local branch of `work`, never pushed — `git branch -r
    // --contains` sees only remote-tracking refs, so this is reachable from none of them.
    await work.checkoutLocalBranch('local-only');
    await work.commit('orphan', [], { '--allow-empty': null });
    const orphanSha = (await work.revparse(['HEAD'])).trim();

    return { work, workPath, baseTip, shared, divergedTip, orphanSha };
}

let root: string;

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'assert-submodule-ready-'));
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

test('an attached HEAD on a base branch, clean, is ready without any GitHub call', async () => {
    const { workPath } = await setupRepo(root);
    const submodule = buildSubmodule({ path: workPath, currentBranch: 'main', detached: false });

    const readiness = await assertSubmoduleReady({
        submodule,
        baseBranches: BASE_BRANCHES,
        githubClient: THROWING_CLIENT,
        githubConfig: GITHUB_CONFIG,
    });

    expect(readiness).toEqual({ kind: 'ready' });
});

test('an attached HEAD on a task branch with unpushed commits is refused', async () => {
    const { workPath } = await setupRepo(root);
    const submodule = buildSubmodule({
        path: workPath,
        currentBranch: 'feat/thing',
        detached: false,
        unpushedCommitsCount: 2,
    });

    const failure = assertSubmoduleReady({
        submodule,
        baseBranches: BASE_BRANCHES,
        githubClient: createPrClient([]),
        githubConfig: GITHUB_CONFIG,
    });

    await expect(failure).rejects.toThrow(UsageError);
    await expect(failure).rejects.toThrow(/not on its origin remote/);
});

test('an attached HEAD on a task branch with no open pull request is refused', async () => {
    const { workPath } = await setupRepo(root);
    const submodule = buildSubmodule({ path: workPath, currentBranch: 'feat/thing', detached: false });

    const failure = assertSubmoduleReady({
        submodule,
        baseBranches: BASE_BRANCHES,
        githubClient: createPrClient([]),
        githubConfig: GITHUB_CONFIG,
    });

    await expect(failure).rejects.toThrow(UsageError);
    await expect(failure).rejects.toThrow(/no open pull request/);
});

test('an attached HEAD on a task branch with an open pull request is ready', async () => {
    const { workPath } = await setupRepo(root);
    const submodule = buildSubmodule({ path: workPath, currentBranch: 'feat/thing', detached: false });

    const readiness = await assertSubmoduleReady({
        submodule,
        baseBranches: BASE_BRANCHES,
        githubClient: createPrClient([{ number: 7, branch: 'feat/thing', state: 'open' }]),
        githubConfig: GITHUB_CONFIG,
    });

    expect(readiness).toEqual({ kind: 'ready' });
});

test('an attached HEAD on a task branch whose pull request already merged is parked on base', async () => {
    const { workPath } = await setupRepo(root);
    const submodule = buildSubmodule({ path: workPath, currentBranch: 'feat/thing', detached: false });

    const readiness = await assertSubmoduleReady({
        submodule,
        baseBranches: BASE_BRANCHES,
        githubClient: createPrClient([{ number: 7, branch: 'feat/thing', state: 'closed', mergedAt: '2026-01-01' }]),
        githubConfig: GITHUB_CONFIG,
    });

    expect(readiness).toEqual({ kind: 'park-on-base' });
});

test('a detached HEAD whose commit is reachable only from base resolves to ready without a GitHub call', async () => {
    const { work, workPath, baseTip } = await setupRepo(root);
    await work.checkout([baseTip]);
    const submodule = buildSubmodule({ path: workPath, detached: true });

    const readiness = await assertSubmoduleReady({
        submodule,
        baseBranches: BASE_BRANCHES,
        githubClient: THROWING_CLIENT,
        githubConfig: GITHUB_CONFIG,
    });

    expect(readiness).toEqual({ kind: 'ready' });
});

test('a detached HEAD whose commit is reachable from exactly one task branch resolves to that branch', async () => {
    const { work, workPath, divergedTip } = await setupRepo(root);
    await work.checkout([divergedTip]);
    const submodule = buildSubmodule({ path: workPath, detached: true });

    const failure = assertSubmoduleReady({
        submodule,
        baseBranches: BASE_BRANCHES,
        githubClient: createPrClient([]),
        githubConfig: GITHUB_CONFIG,
    });

    // No open PR on branchA yet — proves the resolved branch name (not a base branch) drove the
    // decision, by naming it in the refusal.
    await expect(failure).rejects.toThrow(UsageError);
    await expect(failure).rejects.toThrow(/branchA/);
    await expect(failure).rejects.toThrow(/no open pull request/);
});

test('a detached HEAD whose commit is reachable from two task branches propagates the ambiguity as a UsageError', async () => {
    const { work, workPath, shared } = await setupRepo(root);
    await work.checkout([shared]);
    const submodule = buildSubmodule({ path: workPath, detached: true });

    const failure = assertSubmoduleReady({
        submodule,
        baseBranches: BASE_BRANCHES,
        githubClient: THROWING_CLIENT,
        githubConfig: GITHUB_CONFIG,
    });

    await expect(failure).rejects.toThrow(UsageError);
    await expect(failure).rejects.toThrow(/branchA/);
    await expect(failure).rejects.toThrow(/branchB/);
});

// The invariant this task must protect: a detached HEAD whose commit was never pushed anywhere is
// the most destructive shape in the readiness table — the work exists only in this one checkout.
// A regression that mistook "reachable from no remote branch" for "reachable only from base" (both
// collapse to zero non-base candidates in `resolveSubmoduleBranch`) would let this proceed instead
// of refusing, silently risking the commit on the next reset/checkout.
test('a detached HEAD whose commit is on no remote branch at all is refused, not treated as base', async () => {
    const { work, workPath, orphanSha } = await setupRepo(root);
    await work.checkout([orphanSha]);
    const submodule = buildSubmodule({ path: workPath, detached: true });

    const failure = assertSubmoduleReady({
        submodule,
        baseBranches: BASE_BRANCHES,
        githubClient: THROWING_CLIENT,
        githubConfig: GITHUB_CONFIG,
    });

    await expect(failure).rejects.toThrow(UsageError);
    await expect(failure).rejects.toThrow(/not reachable from any remote branch/);
});
