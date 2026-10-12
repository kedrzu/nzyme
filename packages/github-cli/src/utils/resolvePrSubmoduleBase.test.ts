import { expect, test } from 'bun:test';

import type { GithubConfig } from '../GithubConfig.js';
import type { GithubClient } from './createGithubClient.js';
import type { GitHubPR } from './findMatchingPr.js';
import { resolvePrSubmoduleBase } from './resolvePrSubmoduleBase.js';

const GITHUB_CONFIG: GithubConfig = { owner: 'acme', repo: 'main', token: 'ghp_test' };

/**
 * A `GithubClient` whose Stacks API reports `stackBase` as the base of the stack every pull request
 * belongs to, or no stack at all when it is `null`.
 */
function createStacksClient(stackBase: string | null): GithubClient {
    return {
        request: () =>
            Promise.resolve({
                status: 200,
                data: stackBase ? [{ number: 1, base: { ref: stackBase }, open: true, pull_requests: [] }] : [],
            }),
    } as unknown as GithubClient;
}

/**
 * A pull request as `findTaskPrs` returns it, reduced to the fields the lookup reads.
 */
function createPr(number: number, baseRef: string): GitHubPR {
    return { number, base: { ref: baseRef } } as unknown as GitHubPR;
}

test('an ordinary pull request into the trunk has its submodules follow the trunk', async () => {
    const submoduleBase = await resolvePrSubmoduleBase({
        githubClient: createStacksClient(null),
        githubConfig: GITHUB_CONFIG,
        pr: createPr(10, 'main'),
        trunk: 'main',
    });

    expect(submoduleBase).toEqual({ kind: 'trunk', trunk: 'main' });
});

test('an ordinary pull request into release keeps its submodules on their pin', async () => {
    const submoduleBase = await resolvePrSubmoduleBase({
        githubClient: createStacksClient(null),
        githubConfig: GITHUB_CONFIG,
        pr: createPr(10, 'release'),
        trunk: 'main',
    });

    expect(submoduleBase).toEqual({ kind: 'pin', trunk: 'main', landingTrunk: 'release' });
});

// An upper node is based on the node below it. Reading its `base.ref` as where it lands would pin
// the submodules of every node above the bottom of a perfectly ordinary stack into `main`.
test('an upper stack node lands where its stack lands, not on the node below it', async () => {
    const submoduleBase = await resolvePrSubmoduleBase({
        githubClient: createStacksClient('main'),
        githubConfig: GITHUB_CONFIG,
        pr: createPr(11, 'feature/abc-1-stack'),
        trunk: 'main',
    });

    expect(submoduleBase).toEqual({ kind: 'trunk', trunk: 'main' });
});

test('every node of a stack landing on release keeps its submodules on their pin', async () => {
    const submoduleBase = await resolvePrSubmoduleBase({
        githubClient: createStacksClient('release'),
        githubConfig: GITHUB_CONFIG,
        pr: createPr(11, 'feature/abc-1-hotfix'),
        trunk: 'main',
    });

    expect(submoduleBase).toEqual({ kind: 'pin', trunk: 'main', landingTrunk: 'release' });
});

test('a branch with no pull request yet follows the trunk', async () => {
    const submoduleBase = await resolvePrSubmoduleBase({
        // Never reached: there is no pull request to look a stack up for.
        githubClient: {} as GithubClient,
        githubConfig: GITHUB_CONFIG,
        pr: null,
        trunk: 'main',
    });

    expect(submoduleBase).toEqual({ kind: 'trunk', trunk: 'main' });
});
