import { expect, test } from 'bun:test';

import { UsageError } from '@nzyme/cli';

import type { GithubConfig } from '../GithubConfig.js';
import type { GithubClient } from './createGithubClient.js';
import { resolveSubmodulePrChain } from './resolveSubmodulePrChain.js';

const CONFIG: GithubConfig = { owner: 'acme', repo: 'nzyme', token: 'ghp_test' };

interface FakePr {
    number: number;
    head: string;
    base: string;
}

interface FakeStack {
    number: number;
    base: string;
    nodes: { number: number; head: string; merged?: boolean }[];
}

/**
 * A `GithubClient` serving open pull requests and, optionally, the stack record GitHub keeps for
 * them.
 */
function createClient(prs: FakePr[], stack?: FakeStack): GithubClient {
    return {
        rest: {
            pulls: {
                list: () =>
                    Promise.resolve({
                        data: prs.map(pr => ({
                            number: pr.number,
                            state: 'open',
                            head: { ref: pr.head, sha: `sha-${pr.number}` },
                            base: { ref: pr.base },
                        })),
                    }),
            },
        },
        request: (_route: string, params: { pull_request: number }) => {
            const inStack = stack?.nodes.some(node => node.number === params.pull_request);
            return Promise.resolve({
                status: 200,
                data:
                    stack && inStack
                        ? [
                              {
                                  number: stack.number,
                                  base: { ref: stack.base },
                                  open: true,
                                  pull_requests: stack.nodes.map(node => ({
                                      number: node.number,
                                      state: node.merged ? 'closed' : 'open',
                                      draft: false,
                                      merged_at: node.merged ? '2026-10-01T00:00:00Z' : null,
                                      head: { ref: node.head, sha: `sha-${node.number}` },
                                  })),
                              },
                          ]
                        : [],
            });
        },
    } as unknown as GithubClient;
}

function resolve(client: GithubClient, branch: string) {
    return resolveSubmodulePrChain({
        githubClient: client,
        githubConfig: CONFIG,
        submoduleName: 'nzyme',
        branch,
        trunk: 'main',
    });
}

test('a stacked submodule PR resolves to every open node of its stack, bottom first', async () => {
    // HLD-641: #232 sat on #207. Taking in `main` has to start at #207, so the chain must name it
    // even though the submodule is checked out on #232's branch.
    const client = createClient(
        [
            { number: 207, head: 'feat/lower', base: 'main' },
            { number: 232, head: 'feat/upper', base: 'feat/lower' },
        ],
        {
            number: 5,
            base: 'main',
            nodes: [
                { number: 190, head: 'feat/landed', merged: true },
                { number: 207, head: 'feat/lower' },
                { number: 232, head: 'feat/upper' },
            ],
        },
    );

    expect(await resolve(client, 'feat/upper')).toEqual([
        { number: 207, headRef: 'feat/lower' },
        { number: 232, headRef: 'feat/upper' },
    ]);
});

test('without a stack record the chain is followed down through each base', async () => {
    const client = createClient([
        { number: 1, head: 'feat/a', base: 'main' },
        { number: 2, head: 'feat/b', base: 'feat/a' },
        { number: 3, head: 'feat/c', base: 'feat/b' },
    ]);

    expect(await resolve(client, 'feat/c')).toEqual([
        { number: 1, headRef: 'feat/a' },
        { number: 2, headRef: 'feat/b' },
        { number: 3, headRef: 'feat/c' },
    ]);
});

test('a lone PR on the trunk is a chain of one', async () => {
    const client = createClient([{ number: 9, head: 'feat/solo', base: 'main' }]);

    expect(await resolve(client, 'feat/solo')).toEqual([{ number: 9, headRef: 'feat/solo' }]);
});

test('a base that is neither the trunk nor an open PR is refused, naming the PR', async () => {
    const client = createClient([{ number: 4, head: 'feat/hotfix', base: 'release' }]);

    const error = await resolve(client, 'feat/hotfix').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UsageError);
    expect((error as UsageError).message).toContain('PR #4 targets release');
});

test('a stack landing outside the trunk is refused, naming the PR', async () => {
    const client = createClient([{ number: 6, head: 'feat/r', base: 'release' }], {
        number: 2,
        base: 'release',
        nodes: [{ number: 6, head: 'feat/r' }],
    });

    const error = await resolve(client, 'feat/r').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UsageError);
    expect((error as UsageError).message).toContain('PR #6 is in stack #2, which lands on release');
});
