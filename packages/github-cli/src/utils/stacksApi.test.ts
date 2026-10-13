import { expect, test } from 'bun:test';

import type { GithubConfig } from '../GithubConfig.js';
import type { GithubClient } from './createGithubClient.js';
import type { MergeAsyncResult } from './stacksApi.js';
import { getMergeAsyncStatus, mergeStackAsync } from './stacksApi.js';

const CONFIG: GithubConfig = { owner: 'acme', repo: 'widgets', token: 'ghp_test' };

/**
 * The shape Octokit throws for a non-2xx response: the HTTP status plus the response it carried.
 */
class OctokitResponseError extends Error {
    constructor(
        readonly status: number,
        readonly response: { data: unknown },
    ) {
        super(`HTTP ${status}`);
    }
}

function createClient(respond: () => Promise<{ status: number; data: unknown }>): GithubClient {
    return { request: respond } as unknown as GithubClient;
}

// Payloads as GitHub's merge API reference documents them: every field but `status` sits under
// `details`. Reading `uuid` from the top level made every stack merge report failure while GitHub
// was landing it in the background.
test('a submitted stack merge returns the uuid GitHub nests under details', async () => {
    const client = createClient(() =>
        Promise.resolve({
            status: 202,
            data: {
                status: 'pending',
                details: { uuid: 'merge-1', message: 'Merge request accepted', merge_method: 'squash' },
            },
        }),
    );

    const expected: MergeAsyncResult = { status: 'pending', uuid: 'merge-1', message: 'Merge request accepted' };
    expect(await mergeStackAsync(client, CONFIG, 7, 'abc123')).toEqual(expected);
});

test('re-submitting while a merge is already running attaches to it instead of failing', async () => {
    const client = createClient(() =>
        Promise.reject(
            new OctokitResponseError(409, {
                data: { status: 'pending', details: { uuid: 'merge-1', message: 'Merge request already exists' } },
            }),
        ),
    );

    const result = await mergeStackAsync(client, CONFIG, 7, 'abc123');

    expect(result).toEqual({ status: 'pending', uuid: 'merge-1', message: 'Merge request already exists' });
});

test('polling a failed merge surfaces the reason GitHub nests under details', async () => {
    const client = createClient(() =>
        Promise.resolve({
            status: 200,
            data: { status: 'failed', details: { message: 'Required status check "ci" is failing' } },
        }),
    );

    const result = await getMergeAsyncStatus(client, CONFIG, 7, 'merge-1');

    expect(result).toEqual({ status: 'failed', message: 'Required status check "ci" is failing' });
});
