import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { LinearClient } from '@linear/sdk';
import { afterEach, beforeEach, expect, mock, setDefaultTimeout, test } from 'bun:test';

import { UsageError } from '@nzyme/cli-core';
import type { GithubConfig } from '@nzyme/github-cli/GithubConfig.js';
import type { GithubClient } from '@nzyme/github-cli/utils/createGithubClient.js';
import type { GitHubPR } from '@nzyme/github-cli/utils/findMatchingPr.js';
import { createTestLogger } from '@nzyme/logging';

import { switchToTask } from './switchToTask.js';

// Every test builds real repositories and runs a whole task switch against them.
setDefaultTimeout(60_000);

const GITHUB_CONFIG: GithubConfig = { owner: 'acme', repo: 'main', token: 'ghp_test' };
const ISSUE_ID = 'ABC-1';
const TASK_BRANCH = 'abc-1-do-the-thing';

let root: string;
let originalCwd: string;

beforeEach(() => {
    originalCwd = process.cwd();
    root = mkdtempSync(join(tmpdir(), 'switch-to-task-'));
});

afterEach(() => {
    process.chdir(originalCwd);
    rmSync(root, { recursive: true, force: true });
});

test('a new task branch cut from the trunk pushes the submodule at its latest main, keeping the stashed changes out of it', async () => {
    const { mainPath, submodulePath, subMainTip } = setupProduct(root);
    writeFileSync(join(mainPath, 'notes.txt'), 'uncommitted work\n');
    process.chdir(mainPath);

    await switchToTask(createParams({ closedPrs: [] }));

    expect(git(submodulePath, 'branch', '--show-current')).toBe('main');
    expect(git(submodulePath, 'rev-parse', 'HEAD')).toBe(subMainTip);

    git(mainPath, 'fetch', 'origin');
    expect(git(mainPath, 'branch', '--show-current')).toBe(TASK_BRANCH);
    expect(git(mainPath, 'rev-parse', `origin/${TASK_BRANCH}:nzyme`)).toBe(subMainTip);

    // Re-applied after the sync, so it is back in the working tree and was never committed or pushed.
    expect(readFileSync(join(mainPath, 'notes.txt'), 'utf8')).toBe('uncommitted work\n');
    expect(git(mainPath, 'status', '--porcelain')).toBe('?? notes.txt');
    expect(git(mainPath, 'ls-tree', '--name-only', `origin/${TASK_BRANCH}`)).not.toContain('notes.txt');
});

// A hotfix cut from the product's `release` must not carry a submodule commit `main` never ran.
test('a new task branch cut from a non-trunk base leaves the submodule on its pin', async () => {
    const { mainPath, submodulePath, pin } = setupProduct(root);
    process.chdir(mainPath);

    await switchToTask(createParams({ closedPrs: [], branch: 'release' }));

    expect(git(submodulePath, 'rev-parse', 'HEAD')).toBe(pin);

    git(mainPath, 'fetch', 'origin');
    // Cut from `release`: the commit only `release` has is on the new branch.
    expect(git(mainPath, 'log', '--format=%s', `origin/${TASK_BRANCH}`)).toContain('release only');
    expect(git(mainPath, 'rev-parse', `origin/${TASK_BRANCH}:nzyme`)).toBe(pin);
});

test("a reopened task's new versioned branch pushes the submodule at its latest main", async () => {
    const { mainPath, submodulePath, subMainTip } = setupProduct(root);
    process.chdir(mainPath);

    await switchToTask(createParams({ closedPrs: [mergedPr(TASK_BRANCH)] }));

    const reopenedBranch = `${TASK_BRANCH}--v2`;
    expect(git(submodulePath, 'rev-parse', 'HEAD')).toBe(subMainTip);

    git(mainPath, 'fetch', 'origin');
    expect(git(mainPath, 'branch', '--show-current')).toBe(reopenedBranch);
    expect(git(mainPath, 'rev-parse', `origin/${reopenedBranch}:nzyme`)).toBe(subMainTip);
});

test('a submodule that is not safe to move fails the sync, yet the task is started and the stash comes back', async () => {
    const { mainPath, submodulePath, pin } = setupProduct(root);
    writeFileSync(join(mainPath, 'notes.txt'), 'uncommitted work\n');
    writeFileSync(join(submodulePath, 'dirty.txt'), 'submodule work\n');
    process.chdir(mainPath);
    const onTaskSwitched = mock(() => Promise.resolve());

    const failure = switchToTask({ ...createParams({ closedPrs: [] }), onTaskSwitched });

    await expect(failure).rejects.toThrow(UsageError);
    await expect(failure).rejects.toThrow(/nzyme has uncommitted changes/);

    // The branch and its pull request exist, so the task was marked started before the sync threw.
    expect(onTaskSwitched).toHaveBeenCalledWith(expect.objectContaining({ issueId: ISSUE_ID }));

    // The submodule was not moved, its work is intact.
    expect(git(submodulePath, 'rev-parse', 'HEAD')).toBe(pin);
    expect(readFileSync(join(submodulePath, 'dirty.txt'), 'utf8')).toBe('submodule work\n');

    // The user's changes came back off the stash, onto the new branch, uncommitted.
    expect(git(mainPath, 'branch', '--show-current')).toBe(TASK_BRANCH);
    expect(readFileSync(join(mainPath, 'notes.txt'), 'utf8')).toBe('uncommitted work\n');
    expect(git(mainPath, 'status', '--porcelain', '--', 'notes.txt')).toBe('?? notes.txt');
    expect(git(mainPath, 'stash', 'list')).toBe('');
});

/**
 * Inputs to {@link createParams}.
 */
interface CreateParamsOptions {
    /**
     * The task's closed pull requests GitHub reports; a merged one triggers the reopen flow.
     */
    closedPrs: GitHubPR[];

    /**
     * The `--branch` the new branch is cut from.
     */
    branch?: string;
}

/**
 * Build `switchToTask` params for an unstarted issue with no open pull request, run unattended
 * (`yes`), against stubs of Linear and GitHub.
 */
function createParams(options: CreateParamsOptions): Parameters<typeof switchToTask>[0] {
    const issue = {
        identifier: ISSUE_ID,
        title: 'Do the thing',
        description: '',
        url: 'https://linear.app/acme/issue/ABC-1',
        branchName: TASK_BRANCH,
        delegateId: undefined,
        state: Promise.resolve(undefined),
        project: Promise.resolve(undefined),
        team: Promise.resolve({
            states: () => Promise.resolve({ nodes: [{ id: 'in-progress', name: 'In Progress', type: 'started' }] }),
        }),
        update: () => Promise.resolve(),
    };
    const linearClient = { issue: () => Promise.resolve(issue) } as unknown as LinearClient;

    // Open pull requests: none, so the task gets a new one (and no node is stacked on any branch).
    const githubClient = {
        rest: {
            pulls: {
                list: (query: { state: string }) =>
                    Promise.resolve({ data: query.state === 'closed' ? options.closedPrs : [] }),
                create: (pr: { title: string }) =>
                    Promise.resolve({
                        data: { id: 1, number: 7, title: pr.title, body: '', html_url: 'https://github.com/pr/7' },
                    }),
            },
        },
    } as unknown as GithubClient;

    const { logger } = createTestLogger('switchToTask');

    return {
        issueId: ISSUE_ID,
        linearClient,
        githubClient,
        githubConfig: GITHUB_CONFIG,
        logger,
        baseBranches: ['main', 'release'],
        branch: options.branch,
        yes: true,
    };
}

/**
 * A merged pull request of the task, as `pulls.list` returns it.
 */
function mergedPr(headRef: string): GitHubPR {
    return {
        number: 3,
        title: `[${ISSUE_ID}] Do the thing`,
        state: 'closed',
        merged_at: '2026-01-01T00:00:00Z',
        closed_at: '2026-01-01T00:00:00Z',
        head: { ref: headRef },
        base: { ref: 'main' },
    } as unknown as GitHubPR;
}

/**
 * Build a product whose `main` and `release` both pin the submodule at `pin`, with the submodule
 * checked out on its own local `main` at that pin - clean and resting on the trunk. `release` also
 * gains a commit of its own. Then move the submodule's origin `main` on to `subMainTip`, the way it
 * moves while a product branch is idle.
 *
 * Wired up by hand rather than with `git submodule add`, for the reasons `syncAllRepos.test.ts`
 * gives: recent git refuses a `file://` submodule, and `.gitmodules` has to name a GitHub remote.
 */
function setupProduct(dir: string): { mainPath: string; submodulePath: string; pin: string; subMainTip: string } {
    const mainRemote = join(dir, 'origin-main.git');
    const subRemote = join(dir, 'origin-sub.git');
    const subSeed = join(dir, 'sub-seed');
    const mainPath = join(dir, 'main');
    const submodulePath = join(mainPath, 'nzyme');

    git(dir, 'init', '--bare', '--initial-branch=main', mainRemote);
    git(dir, 'init', '--bare', '--initial-branch=main', subRemote);

    git(dir, 'clone', subRemote, subSeed);
    configureIdentity(subSeed);
    git(subSeed, 'checkout', '-b', 'main');
    git(subSeed, 'commit', '--allow-empty', '-m', 'sub c0');
    const pin = git(subSeed, 'rev-parse', 'HEAD');
    git(subSeed, 'push', '-u', 'origin', 'main');

    git(dir, 'clone', mainRemote, mainPath);
    // The code under test commits through its own git instances, which carry no identity.
    configureIdentity(mainPath);
    git(mainPath, 'checkout', '-b', 'main');
    git(mainPath, 'commit', '--allow-empty', '-m', 'main c0');

    git(dir, 'clone', subRemote, submodulePath);
    configureIdentity(submodulePath);

    writeFileSync(
        join(mainPath, '.gitmodules'),
        '[submodule "nzyme"]\n\tpath = nzyme\n\turl = https://github.com/acme/sub.git\n',
    );
    git(mainPath, 'add', '.gitmodules', 'nzyme');
    git(mainPath, 'commit', '-m', 'pin submodule');
    git(mainPath, 'push', '-u', 'origin', 'main');
    git(mainPath, 'checkout', '-b', 'release');
    git(mainPath, 'commit', '--allow-empty', '-m', 'release only');
    git(mainPath, 'push', '-u', 'origin', 'release');
    git(mainPath, 'checkout', 'main');

    git(subSeed, 'commit', '--allow-empty', '-m', 'sub c1 on main');
    const subMainTip = git(subSeed, 'rev-parse', 'HEAD');
    git(subSeed, 'push', 'origin', 'main');

    return { mainPath, submodulePath, pin, subMainTip };
}

/**
 * Give a repository an identity of its own, so commits made in it by any process succeed.
 */
function configureIdentity(path: string): void {
    git(path, 'config', 'user.email', 't@t');
    git(path, 'config', 'user.name', 't');
    git(path, 'config', 'commit.gpgsign', 'false');
}

/**
 * Run git in `cwd` and return its trimmed stdout, failing the test on a non-zero exit.
 */
function git(cwd: string, ...args: string[]): string {
    const result = Bun.spawnSync(['git', ...args], { cwd });
    if (result.exitCode !== 0) {
        throw new Error(`git ${args.join(' ')} failed: ${result.stderr.toString()}`);
    }

    return result.stdout.toString().trim();
}
