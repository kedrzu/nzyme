import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { simpleGit } from 'simple-git';
import type { SimpleGit } from 'simple-git';

import { UsageError } from '@nzyme/cli';
import { createTestLogger } from '@nzyme/logging';
import { assertValue } from '@nzyme/utils';

import type { GithubConfig } from '../GithubConfig.js';
import type { GithubClient } from './createGithubClient.js';

const GITHUB_CONFIG: GithubConfig = { owner: 'acme', repo: 'main', token: 'ghp_test' };

/** Answers handed to the interactive ladder's prompts, in the order they are asked. */
const promptAnswers: string[] = [];

/** Messages of the prompts actually asked, so a test can assert what was (not) put to the human. */
const promptMessages: string[] = [];

// A terminal is the one thing no test has, so `enquirer` is stubbed — the only system boundary here
// besides Octokit. A prompt with no queued answer fails the test rather than hanging: "the question
// was never asked" and "the question was asked" are both assertions below.
await mock.module('enquirer', () => ({
    default: {
        prompt(question: { message: string; name: string }) {
            promptMessages.push(question.message);
            const answer = assertValue(promptAnswers.shift(), `Unexpected prompt: ${question.message}`);

            return Promise.resolve({ [question.name]: answer });
        },
    },
}));

const { handleSubmoduleReadyPreparation } = await import('./handleSubmoduleReadyPreparation.js');

interface FakePr {
    number: number;
    branch: string;
    state: 'closed' | 'open';
    mergedAt?: string;
}

/**
 * A `GithubClient` stub answering `pulls.list` from a fixed list, and recording every attempt to
 * create a pull request. Octokit is a system boundary, so it is stubbed; nothing else is — the git
 * side of every test below runs against real repositories.
 */
function createGithubClientStub(prs: FakePr[]): { client: GithubClient; createdPrTitles: string[] } {
    const createdPrTitles: string[] = [];

    const client = {
        rest: {
            pulls: {
                list(listParams: { state: string }) {
                    return Promise.resolve({
                        data: prs
                            .filter(pr => pr.state === listParams.state)
                            .map(pr => ({
                                number: pr.number,
                                title: `pr ${pr.number}`,
                                head: { ref: pr.branch },
                                merged_at: pr.mergedAt ?? null,
                            })),
                    });
                },
                create(createParams: { title: string }) {
                    createdPrTitles.push(createParams.title);
                    return Promise.resolve({
                        data: {
                            body: '',
                            html_url: 'https://example.com/pr/1',
                            id: 1,
                            number: 1,
                            title: createParams.title,
                        },
                    });
                },
            },
        },
    } as unknown as GithubClient;

    return { client, createdPrTitles };
}

/**
 * Build a superproject on `main` with one submodule, both cloned from their own bare origins, and
 * with the submodule's commit recorded as a gitlink.
 *
 * The submodule is wired up by hand rather than with `git submodule add` for two reasons: recent
 * git refuses a `file://` submodule without `protocol.file.allow`, and its `.gitmodules` URL has to
 * look like a GitHub remote for `getSubmoduleGithubConfig` to resolve it — which is exactly what a
 * real superproject's does.
 */
async function setupSuperproject(root: string): Promise<{ mainPath: string; submodulePath: string; sub: SimpleGit }> {
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
    // The production code creates its own git instances, which carry no identity of their own, so
    // the identity has to live in the repositories themselves.
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

    return { mainPath, submodulePath, sub };
}

/**
 * Put the submodule on its own pushed branch, one commit ahead of the gitlink the main repository
 * records — the ordinary shape of submodule work that has been published but not yet pointed at.
 */
async function branchAndPushSubmodule(sub: SimpleGit, branch: string): Promise<void> {
    await sub.checkoutLocalBranch(branch);
    await sub.commit('sub c1', [], { '--allow-empty': null });
    await sub.push(['-u', 'origin', branch]);
}

/**
 * Detach the submodule and commit on top of the detached HEAD — work reachable from no branch at
 * all, local or remote, and therefore present in this one checkout and nowhere else.
 */
async function commitOnDetachedHead(sub: SimpleGit): Promise<void> {
    await sub.checkout(['--detach']);
    await sub.commit('sub c1', [], { '--allow-empty': null });
}

let root: string;
let originalCwd: string;

beforeEach(() => {
    originalCwd = process.cwd();
    root = mkdtempSync(join(tmpdir(), 'handle-submodule-ready-'));
    promptAnswers.length = 0;
    promptMessages.length = 0;
});

afterEach(() => {
    process.chdir(originalCwd);
    rmSync(root, { recursive: true, force: true });
});

// Unattended, this path must never invent a branch, a commit or a pull request in the submodule's
// repository. A regression that reintroduced the old behaviour — force the submodule onto a branch
// named after the main repository's task, commit it and open a PR — would leave a branch and a
// commit here instead of refusing.
test('a dirty submodule is refused unattended, with no branch, no commit and no pull request created', async () => {
    const { mainPath, submodulePath } = await setupSuperproject(root);
    const { logger } = createTestLogger('handleSubmoduleReadyPreparation');
    const sub = simpleGit({ baseDir: submodulePath });
    const headBefore = (await sub.revparse(['HEAD'])).trim();
    writeFileSync(join(submodulePath, 'sub-work.txt'), 'work in the submodule\n');

    process.chdir(mainPath);
    const { client, createdPrTitles } = createGithubClientStub([]);

    const failure = handleSubmoduleReadyPreparation({
        githubClient: client,
        githubConfig: GITHUB_CONFIG,
        logger,
        baseBranch: 'main',
        baseBranches: ['main'],
        unattended: true,
    });

    await expect(failure).rejects.toThrow(UsageError);
    await expect(failure).rejects.toThrow(/nzyme/);

    expect((await sub.branchLocal()).all).toEqual(['main']);
    expect((await sub.revparse(['HEAD'])).trim()).toBe(headBefore);
    expect((await sub.status()).files.map(file => file.path)).toEqual(['sub-work.txt']);
    expect(createdPrTitles).toEqual([]);
});

test('a submodule branch with no open pull request is refused unattended rather than having one opened', async () => {
    const { mainPath, sub } = await setupSuperproject(root);
    const { logger } = createTestLogger('handleSubmoduleReadyPreparation');
    await branchAndPushSubmodule(sub, 'feat/thing');

    process.chdir(mainPath);
    const { client, createdPrTitles } = createGithubClientStub([]);

    const failure = handleSubmoduleReadyPreparation({
        githubClient: client,
        githubConfig: GITHUB_CONFIG,
        logger,
        baseBranch: 'main',
        baseBranches: ['main'],
        unattended: true,
    });

    await expect(failure).rejects.toThrow(UsageError);
    await expect(failure).rejects.toThrow(/no open pull request/);
    expect(createdPrTitles).toEqual([]);
});

// `updateSubmoduleReference` is the only thing that stages the submodule's new commit in the main
// repository. Dropping it would leave the submodule's work pushed while the superproject still
// points at the old commit — a gitlink nobody's branch contains, which is what CI's
// submodule-ref check exists to catch.
test('a ready submodule has its new commit staged in the main repository', async () => {
    const { mainPath, sub } = await setupSuperproject(root);
    const { logger } = createTestLogger('handleSubmoduleReadyPreparation');
    await branchAndPushSubmodule(sub, 'feat/thing');

    process.chdir(mainPath);
    const { client, createdPrTitles } = createGithubClientStub([{ number: 7, branch: 'feat/thing', state: 'open' }]);

    await handleSubmoduleReadyPreparation({
        githubClient: client,
        githubConfig: GITHUB_CONFIG,
        logger,
        baseBranch: 'main',
        baseBranches: ['main'],
        unattended: true,
    });

    const main = simpleGit({ baseDir: mainPath });
    const staged = (await main.raw(['diff', '--cached', '--name-only'])).trim().split('\n');

    expect(staged).toEqual(['nzyme']);
    expect((await main.revparse(['HEAD:nzyme'])).trim()).not.toBe((await sub.revparse(['HEAD'])).trim());
    expect((await main.raw(['rev-parse', ':nzyme'])).trim()).toBe((await sub.revparse(['HEAD'])).trim());
    expect(createdPrTitles).toEqual([]);
});

test('a submodule whose pull request already merged is parked back on its base branch', async () => {
    const { mainPath, sub } = await setupSuperproject(root);
    const { logger } = createTestLogger('handleSubmoduleReadyPreparation');
    await branchAndPushSubmodule(sub, 'feat/thing');

    process.chdir(mainPath);
    const { client } = createGithubClientStub([
        { number: 7, branch: 'feat/thing', state: 'closed', mergedAt: '2026-01-01T00:00:00Z' },
    ]);

    await handleSubmoduleReadyPreparation({
        githubClient: client,
        githubConfig: GITHUB_CONFIG,
        logger,
        baseBranch: 'main',
        baseBranches: ['main'],
        unattended: true,
    });

    const status = await sub.status();
    expect(status.current).toBe('main');
    expect((await sub.revparse(['HEAD'])).trim()).toBe((await sub.revparse(['origin/main'])).trim());
});

// The interactive counterpart of the unattended refusals above. `getSubmoduleInfo` computes
// `unpushedCommitsCount` only for an attached HEAD, so a detached one with a clean tree reports
// zero — and a local commit sitting on top of the gitlink used to read as "nothing to publish":
// no branch offered, and the detached-HEAD warning written for exactly this case suppressed, while
// the gitlink was staged onto a commit nobody else can see.
test('a detached submodule carrying an unpushed commit is offered a branch and warned about', async () => {
    const { mainPath, sub } = await setupSuperproject(root);
    const { logger, logs } = createTestLogger('handleSubmoduleReadyPreparation');
    await commitOnDetachedHead(sub);

    process.chdir(mainPath);
    const { client, createdPrTitles } = createGithubClientStub([]);
    promptAnswers.push('no');

    await handleSubmoduleReadyPreparation({
        githubClient: client,
        githubConfig: GITHUB_CONFIG,
        logger,
        baseBranch: 'main',
        baseBranches: ['main'],
        unattended: false,
    });

    expect(promptMessages).toEqual(['Open a pull request for this work in nzyme?']);

    const warnings = logs.filter(log => log.level === 'warn');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.message).toContain('HEAD is detached');
    expect(createdPrTitles).toEqual([]);
});

// The other half of the same check: a detached HEAD is the ordinary state of a gitlink-pinned
// submodule, so one resting on an already-pushed commit must stay silent — otherwise every push
// would nag about a submodule nobody has touched.
test('a detached submodule resting on a pushed commit is neither questioned nor warned about', async () => {
    const { mainPath, sub } = await setupSuperproject(root);
    const { logger, logs } = createTestLogger('handleSubmoduleReadyPreparation');
    await sub.checkout(['--detach']);

    process.chdir(mainPath);
    const { client, createdPrTitles } = createGithubClientStub([]);

    await handleSubmoduleReadyPreparation({
        githubClient: client,
        githubConfig: GITHUB_CONFIG,
        logger,
        baseBranch: 'main',
        baseBranches: ['main'],
        unattended: false,
    });

    expect(promptMessages).toEqual([]);
    expect(logs.filter(log => log.level === 'warn')).toEqual([]);
    expect(createdPrTitles).toEqual([]);
});
