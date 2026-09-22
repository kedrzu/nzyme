import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, test } from 'bun:test';
import { simpleGit } from 'simple-git';

import { UsageError } from '@nzyme/cli';
import { createTestLogger } from '@nzyme/logging';

import type { GithubConfig } from '../GithubConfig.js';
import type { GithubClient } from './createGithubClient.js';
import { syncAllRepos } from './syncAllRepos.js';

const GITHUB_CONFIG: GithubConfig = { owner: 'acme', repo: 'main', token: 'ghp_test' };

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
        baseBranch: 'main',
        baseBranches: ['main'],
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
        baseBranch: 'main',
        baseBranches: ['main'],
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
