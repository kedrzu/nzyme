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

interface CommitStatus {
    context: string;
    state: string;
}

interface ClientState {
    /** mergeable_state values returned by successive pulls.get calls (last one repeats). */
    mergeableStates: string[];
    /** check_runs returned by successive checks.listForRef calls (last one repeats). */
    checkRuns?: CheckRun[][];
    /** combined.statuses returned by successive getCombinedStatusForRef calls (last one repeats). */
    statuses?: CommitStatus[][];
}

function pick<T>(values: T[] | undefined, call: number, fallback: T): T {
    if (!values || values.length === 0) {
        return fallback;
    }
    return values[Math.min(call, values.length - 1)] ?? fallback;
}

function createClient(state: ClientState): GithubClient {
    let getCall = 0;
    let checksCall = 0;
    let statusCall = 0;
    return {
        rest: {
            pulls: {
                get() {
                    const mergeableState = pick(state.mergeableStates, getCall, 'clean');
                    getCall++;
                    return Promise.resolve({
                        data: { mergeable_state: mergeableState, head: { sha: 'sha-1' } },
                    });
                },
            },
            checks: {
                listForRef() {
                    const checkRuns = pick(state.checkRuns, checksCall, []);
                    checksCall++;
                    return Promise.resolve({ data: { check_runs: checkRuns } });
                },
            },
            repos: {
                getCombinedStatusForRef() {
                    const statuses = pick(state.statuses, statusCall, []);
                    statusCall++;
                    return Promise.resolve({ data: { statuses } });
                },
            },
        },
    } as unknown as GithubClient;
}

test('resolves immediately when mergeable_state is clean and there are no checks', async () => {
    const { logger } = createTestLogger('waitForRequiredChecks');
    const client = createClient({ mergeableStates: ['clean'] });

    await waitForRequiredChecks({ client, config: CONFIG, prNumber: 1, logger, intervalMs: 0 });
});

test('resolves when all check runs have completed successfully', async () => {
    const { logger } = createTestLogger('waitForRequiredChecks');
    const client = createClient({
        mergeableStates: ['unstable'],
        checkRuns: [
            [
                { name: 'ci', status: 'completed', conclusion: 'success' },
                { name: 'lint', status: 'completed', conclusion: 'skipped' },
            ],
        ],
    });

    await waitForRequiredChecks({ client, config: CONFIG, prNumber: 1, logger, intervalMs: 0 });
});

test('waits while a check is pending, then resolves once it completes', async () => {
    const { logger } = createTestLogger('waitForRequiredChecks');
    const client = createClient({
        mergeableStates: ['blocked', 'unstable'],
        checkRuns: [
            [{ name: 'ci', status: 'in_progress', conclusion: null }],
            [{ name: 'ci', status: 'completed', conclusion: 'success' }],
        ],
    });

    await waitForRequiredChecks({ client, config: CONFIG, prNumber: 1, logger, intervalMs: 0 });
});

test('throws when a check run has failed', async () => {
    const { logger } = createTestLogger('waitForRequiredChecks');
    const client = createClient({
        mergeableStates: ['blocked'],
        checkRuns: [[{ name: 'unit-tests', status: 'completed', conclusion: 'failure' }]],
    });

    await expect(
        waitForRequiredChecks({ client, config: CONFIG, prNumber: 1, logger, intervalMs: 0 }),
    ).rejects.toBeInstanceOf(UsageError);
});

test('throws when a non-required check fails even though mergeable_state is unstable', async () => {
    const { logger } = createTestLogger('waitForRequiredChecks');
    const client = createClient({
        mergeableStates: ['unstable'],
        checkRuns: [[{ name: 'optional-e2e', status: 'completed', conclusion: 'failure' }]],
    });

    await expect(
        waitForRequiredChecks({ client, config: CONFIG, prNumber: 1, logger, intervalMs: 0 }),
    ).rejects.toBeInstanceOf(UsageError);
});

test('throws when a commit status reports failure', async () => {
    const { logger } = createTestLogger('waitForRequiredChecks');
    const client = createClient({
        mergeableStates: ['blocked'],
        statuses: [[{ context: 'deploy', state: 'failure' }]],
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

test('throws after the timeout while a check is still pending', async () => {
    const { logger } = createTestLogger('waitForRequiredChecks');
    const client = createClient({
        mergeableStates: ['blocked'],
        checkRuns: [[{ name: 'ci', status: 'in_progress', conclusion: null }]],
    });

    await expect(
        waitForRequiredChecks({ client, config: CONFIG, prNumber: 1, logger, intervalMs: 0, timeoutMs: 0 }),
    ).rejects.toBeInstanceOf(UsageError);
});
