import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, test } from 'bun:test';
import { simpleGit } from 'simple-git';

import { UsageError } from '@nzyme/cli';
import { createTestLogger } from '@nzyme/logging';

import type { GithubConfig } from '../GithubConfig.js';
import type { GithubClient } from './createGithubClient.js';
import { assertSubmodulesReady } from './mergeTaskPrs.js';

const GITHUB_CONFIG: GithubConfig = { owner: 'acme', repo: 'main', token: 'ghp_test' };
const BASE_BRANCHES = ['main'];

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
        baseBranches: BASE_BRANCHES,
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
        baseBranches: BASE_BRANCHES,
        logger,
    });

    expect(toPark.map(submodule => submodule.name)).toEqual(['nzyme']);

    // Reported, not acted on: `assertSubmodulesReady` must not reset the submodule itself.
    const sub = simpleGit({ baseDir: submodulePath });
    expect((await sub.revparse(['HEAD'])).trim()).toBe(submoduleHeadBefore);
});
