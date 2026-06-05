import { expect, test } from 'bun:test';

import { UsageError } from '@nzyme/cli';

import type { GithubConfig } from '../GithubConfig.js';
import type { GithubClient } from './createGithubClient.js';
import { mergePullRequestSquash } from './mergePullRequestSquash.js';

const CONFIG: GithubConfig = { owner: 'acme', repo: 'widgets', token: 'ghp_test' };

type MergeCall = Parameters<GithubClient['rest']['pulls']['merge']>[0];

function createClient(impl: (params: MergeCall) => Promise<void>): { client: GithubClient; calls: MergeCall[] } {
    const calls: MergeCall[] = [];
    const client = {
        rest: {
            pulls: {
                async merge(params: MergeCall) {
                    calls.push(params);
                    await impl(params);
                },
            },
        },
    } as unknown as GithubClient;

    return { client, calls };
}

test('merges with merge_method squash and the correct owner/repo/number', async () => {
    const { client, calls } = createClient(() => Promise.resolve());

    await mergePullRequestSquash(client, CONFIG, 42);

    expect(calls).toHaveLength(1);

    const expected: MergeCall = {
        owner: 'acme',
        repo: 'widgets',
        pull_number: 42,
        merge_method: 'squash',
    };
    expect(calls[0]).toEqual(expected);
});

test('maps a GitHub API rejection to a UsageError', async () => {
    const { client } = createClient(() => Promise.reject(new Error('Pull Request is not mergeable')));

    await expect(mergePullRequestSquash(client, CONFIG, 42)).rejects.toBeInstanceOf(UsageError);
});
