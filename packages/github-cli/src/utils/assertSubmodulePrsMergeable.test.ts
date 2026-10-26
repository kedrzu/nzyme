import { expect, test } from 'bun:test';

import { UsageError } from '@nzyme/cli';
import { createTestLogger } from '@nzyme/logging';

import { assertSubmodulePrsMergeable } from './assertSubmodulePrsMergeable.js';
import type { GithubClient } from './createGithubClient.js';
import type { RefreshedSubmodulePr } from './refreshSubmoduleChain.js';

const { logger } = createTestLogger('assertSubmodulePrsMergeable');

const LOWER: RefreshedSubmodulePr = {
    submoduleName: 'nzyme',
    githubConfig: { owner: 'acme', repo: 'nzyme', token: 'ghp_test' },
    number: 207,
    headRef: 'feat/lower',
    headSha: 'lower-new',
};
const UPPER: RefreshedSubmodulePr = { ...LOWER, number: 232, headRef: 'feat/upper', headSha: 'upper-new' };

interface PrState {
    sha: string;
    mergeable: boolean | null;
    mergeable_state: string;
}

/**
 * A `GithubClient` answering `pulls.get` from a per-PR script: each read takes the next state, and
 * the last one repeats — how GitHub moves from the pre-push head to a computed answer.
 */
function createClient(script: Record<number, PrState[]>): GithubClient {
    const reads = new Map<number, number>();
    return {
        rest: {
            pulls: {
                get: (params: { pull_number: number }) => {
                    const states = script[params.pull_number] ?? [];
                    const index = reads.get(params.pull_number) ?? 0;
                    reads.set(params.pull_number, index + 1);
                    const state = states[Math.min(index, states.length - 1)];
                    return Promise.resolve({
                        data: {
                            head: { sha: state?.sha },
                            mergeable: state?.mergeable,
                            mergeable_state: state?.mergeable_state,
                        },
                    });
                },
            },
        },
    } as unknown as GithubClient;
}

function check(client: GithubClient, timeoutMs = 1_000) {
    return assertSubmodulePrsMergeable({ githubClient: client, prs: [LOWER, UPPER], logger, intervalMs: 1, timeoutMs });
}

test('a refreshed chain GitHub reports as mergeable passes once it reports the new heads', async () => {
    const client = createClient({
        207: [
            { sha: 'lower-old', mergeable: true, mergeable_state: 'clean' },
            { sha: 'lower-new', mergeable: null, mergeable_state: 'unknown' },
            { sha: 'lower-new', mergeable: true, mergeable_state: 'clean' },
        ],
        232: [{ sha: 'upper-new', mergeable: true, mergeable_state: 'blocked' }],
    });

    await expect(check(client)).resolves.toBeUndefined();
});

// HLD-641: #232 showed as conflicting on GitHub while `task refresh` said everything was fine.
test('a submodule PR GitHub reports as conflicting fails the check and is named', async () => {
    const client = createClient({
        207: [{ sha: 'lower-new', mergeable: true, mergeable_state: 'clean' }],
        232: [{ sha: 'upper-new', mergeable: false, mergeable_state: 'dirty' }],
    });

    const error = await check(client).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UsageError);
    expect((error as UsageError).message).toContain('nzyme PR #232 (feat/upper) has conflicts');
    expect((error as UsageError).message).not.toContain('#207');
});

// A conflict reported for the head before the push says nothing about this refresh, in either
// direction — waiting for the new head is what keeps a stale "dirty" or "clean" from deciding.
test('a PR still reporting its pre-refresh head is never confirmed, so the check fails rather than passing', async () => {
    const client = createClient({
        207: [{ sha: 'lower-new', mergeable: true, mergeable_state: 'clean' }],
        232: [{ sha: 'upper-old', mergeable: true, mergeable_state: 'clean' }],
    });

    const error = await check(client, 20).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UsageError);
    expect((error as UsageError).message).toContain('nzyme PR #232 (feat/upper): GitHub did not confirm');
});
