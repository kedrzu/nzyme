import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, test } from 'bun:test';
import { simpleGit } from 'simple-git';

import { createTestLogger } from '@nzyme/logging';

import type { GithubConfig } from '../GithubConfig.js';
import { convertAllPrsToReady } from './convertAllPrsToReady.js';
import type { GithubClient } from './createGithubClient.js';

const GITHUB_CONFIG: GithubConfig = { owner: 'acme', repo: 'main', token: 'ghp_test' };

/**
 * A `GithubClient` stub for the submodule's repository, which has one open draft pull request on
 * `branch`. Records the repository and number of every pull request taken out of draft.
 */
function createDraftPrClient(branch: string): { client: GithubClient; readied: string[] } {
    const readied: string[] = [];

    const client = {
        rest: {
            pulls: {
                list: (params: { repo: string; state: string }) =>
                    Promise.resolve({
                        data:
                            params.repo === 'sub' && params.state === 'open'
                                ? [{ number: 5, draft: true, head: { ref: branch }, html_url: 'https://x/5' }]
                                : [],
                    }),
                get: (params: { repo: string; pull_number: number }) =>
                    Promise.resolve({ data: { draft: true, node_id: `${params.repo}#${params.pull_number}` } }),
            },
        },
        graphql: (_mutation: string, variables: { pullRequestId: string }) => {
            readied.push(variables.pullRequestId);
            return Promise.resolve({ markPullRequestReadyForReview: { pullRequest: { isDraft: false } } });
        },
    } as unknown as GithubClient;

    return { client, readied };
}

/**
 * Build a superproject with one submodule checked out on `branch` — a pushed branch of the
 * submodule's own repository — wired up by hand for the reasons `syncAllRepos.test.ts` gives.
 */
async function setupSuperproject(dir: string, branch: string): Promise<string> {
    const mainRemote = join(dir, 'origin-main.git');
    const subRemote = join(dir, 'origin-sub.git');
    const mainPath = join(dir, 'main');
    const submodulePath = join(mainPath, 'nzyme');

    const bare = simpleGit();
    await bare.init(['--bare', mainRemote]);
    await bare.init(['--bare', subRemote]);
    await bare.cwd(subRemote).raw(['symbolic-ref', 'HEAD', 'refs/heads/main']);

    await simpleGit().clone(mainRemote, mainPath);
    const main = simpleGit({ baseDir: mainPath, config: ['user.email=t@t', 'user.name=t', 'commit.gpgsign=false'] });
    await main.checkoutLocalBranch('main');
    await main.commit('main c0', [], { '--allow-empty': null });

    await simpleGit().clone(subRemote, submodulePath);
    const sub = simpleGit({
        baseDir: submodulePath,
        config: ['user.email=t@t', 'user.name=t', 'commit.gpgsign=false'],
    });
    await sub.checkoutLocalBranch('main');
    await sub.commit('sub c0', [], { '--allow-empty': null });
    await sub.push(['-u', 'origin', 'main']);
    await sub.checkoutLocalBranch(branch);
    await sub.commit('sub c1', [], { '--allow-empty': null });
    await sub.push(['-u', 'origin', branch]);

    writeFileSync(
        join(mainPath, '.gitmodules'),
        '[submodule "nzyme"]\n\tpath = nzyme\n\turl = https://github.com/acme/sub.git\n',
    );
    await main.add(['.gitmodules', 'nzyme']);
    await main.commit('add submodule');

    return mainPath;
}

let root: string;
let originalCwd: string;

beforeEach(() => {
    originalCwd = process.cwd();
    root = mkdtempSync(join(tmpdir(), 'convert-all-prs-to-ready-'));
});

afterEach(() => {
    process.chdir(originalCwd);
    rmSync(root, { recursive: true, force: true });
});

test("a task landing on the trunk takes its submodule's pull request out of draft", async () => {
    process.chdir(await setupSuperproject(root, 'feat/thing'));
    const { client, readied } = createDraftPrClient('feat/thing');
    const { logger } = createTestLogger('convertAllPrsToReady');

    await convertAllPrsToReady({
        githubClient: client,
        githubConfig: GITHUB_CONFIG,
        logger,
        mainPrs: [{ number: 10, draft: false, html_url: 'https://x/10' }],
        submoduleBase: { kind: 'trunk', trunk: 'main' },
    });

    expect(readied).toEqual(['sub#5']);
});

// `task ready` on a hotfix into the product's `release`, whose submodule pin sits on nzyme's own
// `release` line — which has an open pull request of its own (nzyme's release merging back into
// its `main`). That pull request belongs to nzyme's release process, not to this task, and must not
// be taken out of draft by it.
test('a task that does not land on the trunk leaves every submodule pull request alone', async () => {
    process.chdir(await setupSuperproject(root, 'release'));
    const { client, readied } = createDraftPrClient('release');
    const { logger } = createTestLogger('convertAllPrsToReady');

    await convertAllPrsToReady({
        githubClient: client,
        githubConfig: GITHUB_CONFIG,
        logger,
        mainPrs: [{ number: 10, draft: false, html_url: 'https://x/10' }],
        submoduleBase: { kind: 'pin', trunk: 'main', landingTrunk: 'release' },
    });

    expect(readied).toEqual([]);
});
