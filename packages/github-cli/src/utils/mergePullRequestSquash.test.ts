import { expect, test } from 'bun:test';

import { UsageError } from '@nzyme/cli';

import type { GithubConfig } from '../GithubConfig.js';
import type { GithubClient } from './createGithubClient.js';
import { mergePullRequestSquash } from './mergePullRequestSquash.js';

const CONFIG: GithubConfig = { owner: 'acme', repo: 'widgets', token: 'ghp_test' };

interface MergeCall {
    owner: string;
    repo: string;
    pull_number: number;
    merge_method: string;
}

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
    expect(calls[0]).toEqual({
        owner: 'acme',
        repo: 'widgets',
        pull_number: 42,
        merge_method: 'squash',
    });
});

test('maps a GitHub API rejection to a UsageError', async () => {
    const { client } = createClient(() => Promise.reject(new Error('Pull Request is not mergeable')));

    await expect(mergePullRequestSquash(client, CONFIG, 42)).rejects.toBeInstanceOf(UsageError);
});
