import { expect, test } from 'bun:test';

import { UsageError } from '@nzyme/cli';
import { createTestLogger } from '@nzyme/logging';

import type { GithubConfig } from '../GithubConfig.js';
import type { GithubClient } from './createGithubClient.js';
import { waitForRequiredChecks } from './waitForRequiredChecks.js';

const CONFIG: GithubConfig = { owner: 'acme', repo: 'widgets', token: 'ghp_test' };

interface CheckRun {
    name: string;
    status: string;
    conclusion: string | null;
}

interface ClientState {
    /** mergeable_state values returned by successive pulls.get calls (last one repeats). */
    mergeableStates: string[];
    checkRuns?: CheckRun[];
    combinedState?: string;
}

function createClient(state: ClientState): GithubClient {
    let getCall = 0;
    return {
        rest: {
            pulls: {
                get() {
                    const index = Math.min(getCall, state.mergeableStates.length - 1);
                    getCall++;
                    return Promise.resolve({
                        data: { mergeable_state: state.mergeableStates[index], head: { sha: 'sha-1' } },
                    });
                },
            },
            checks: {
                listForRef() {
                    return Promise.resolve({ data: { check_runs: state.checkRuns ?? [] } });
                },
            },
            repos: {
                getCombinedStatusForRef() {
                    return Promise.resolve({ data: { state: state.combinedState ?? 'success', statuses: [] } });
                },
            },
        },
    } as unknown as GithubClient;
}

test('resolves immediately when mergeable_state is clean', async () => {
    const { logger } = createTestLogger('waitForRequiredChecks');
    const client = createClient({ mergeableStates: ['clean'] });

    await waitForRequiredChecks({ client, config: CONFIG, prNumber: 1, logger, intervalMs: 0 });
});

test('waits while blocked with a pending check, then resolves when clean', async () => {
    const { logger } = createTestLogger('waitForRequiredChecks');
    const client = createClient({
        mergeableStates: ['blocked', 'clean'],
        checkRuns: [{ name: 'ci', status: 'in_progress', conclusion: null }],
        combinedState: 'pending',
    });

    await waitForRequiredChecks({ client, config: CONFIG, prNumber: 1, logger, intervalMs: 0 });
});

test('throws when blocked with a failing required check', async () => {
    const { logger } = createTestLogger('waitForRequiredChecks');
    const client = createClient({
        mergeableStates: ['blocked'],
        checkRuns: [{ name: 'unit-tests', status: 'completed', conclusion: 'failure' }],
        combinedState: 'success',
    });

    await expect(
        waitForRequiredChecks({ client, config: CONFIG, prNumber: 1, logger, intervalMs: 0 }),
    ).rejects.toBeInstanceOf(UsageError);
});

test('throws when the PR is dirty (conflicts with base)', async () => {
    const { logger } = createTestLogger('waitForRequiredChecks');
    const client = createClient({ mergeableStates: ['dirty'] });

    await expect(
        waitForRequiredChecks({ client, config: CONFIG, prNumber: 1, logger, intervalMs: 0 }),
    ).rejects.toBeInstanceOf(UsageError);
});

test('throws after the timeout while still blocked without a failure', async () => {
    const { logger } = createTestLogger('waitForRequiredChecks');
    const client = createClient({
        mergeableStates: ['blocked'],
        checkRuns: [{ name: 'ci', status: 'in_progress', conclusion: null }],
        combinedState: 'pending',
    });

    await expect(
        waitForRequiredChecks({ client, config: CONFIG, prNumber: 1, logger, intervalMs: 0, timeoutMs: 0 }),
    ).rejects.toBeInstanceOf(UsageError);
});
