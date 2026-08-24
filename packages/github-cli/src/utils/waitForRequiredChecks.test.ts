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
    check_suite?: { id: number };
}

interface CommitStatus {
    context: string;
    state: string;
}

interface ClientState {
    /** mergeable_state values returned by successive pulls.get calls (last one repeats). */
    mergeableStates: string[];
    /** head.sha values returned by successive pulls.get calls (last one repeats). Defaults to 'sha-1'. */
    headShas?: string[];
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
                    const headSha = pick(state.headShas, getCall, 'sha-1');
                    getCall++;
                    return Promise.resolve({
                        data: { mergeable_state: mergeableState, head: { sha: headSha } },
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

test('ignores the stale head SHA and resolves once GitHub reports the expected commit', async () => {
    const { logger } = createTestLogger('waitForRequiredChecks');
    // First poll reports the previous commit (which carried a failing check); the gate must skip it
    // entirely (no check evaluation) and wait for the expected commit, whose checks pass.
    const client = createClient({
        mergeableStates: ['blocked', 'unstable'],
        headShas: ['old-sha', 'new-sha'],
        checkRuns: [[{ name: 'submodules-merged', status: 'completed', conclusion: 'success' }]],
    });

    await waitForRequiredChecks({
        client,
        config: CONFIG,
        prNumber: 1,
        logger,
        intervalMs: 0,
        expectedHeadSha: 'new-sha',
    });
});

test('aborts on a failing check once the expected head SHA is reported', async () => {
    const { logger } = createTestLogger('waitForRequiredChecks');
    const client = createClient({
        mergeableStates: ['blocked'],
        headShas: ['new-sha'],
        checkRuns: [[{ name: 'submodules-merged', status: 'completed', conclusion: 'failure' }]],
    });

    await expect(
        waitForRequiredChecks({
            client,
            config: CONFIG,
            prNumber: 1,
            logger,
            intervalMs: 0,
            expectedHeadSha: 'new-sha',
        }),
    ).rejects.toBeInstanceOf(UsageError);
});

test('throws after the timeout when the expected head SHA never registers', async () => {
    const { logger } = createTestLogger('waitForRequiredChecks');
    const client = createClient({
        mergeableStates: ['clean'],
        headShas: ['old-sha'],
    });

    await expect(
        waitForRequiredChecks({
            client,
            config: CONFIG,
            prNumber: 1,
            logger,
            intervalMs: 0,
            timeoutMs: 0,
            expectedHeadSha: 'new-sha',
        }),
    ).rejects.toBeInstanceOf(UsageError);
});

test('with expectedHeadSha set, does not pass on clean + zero checks (suppresses no-CI escape)', async () => {
    const { logger } = createTestLogger('waitForRequiredChecks');
    // Head SHA matches and mergeable_state is clean, but no checks have registered yet. Because a
    // freshly-pushed commit is expected to run CI, the gate must keep waiting rather than pass — so
    // it eventually times out instead of resolving.
    const client = createClient({
        mergeableStates: ['clean'],
        headShas: ['new-sha'],
    });

    await expect(
        waitForRequiredChecks({
            client,
            config: CONFIG,
            prNumber: 1,
            logger,
            intervalMs: 0,
            timeoutMs: 0,
            expectedHeadSha: 'new-sha',
        }),
    ).rejects.toBeInstanceOf(UsageError);
});

test('ignores a cancelled check run superseded by a newer suite of the same name', async () => {
    const { logger } = createTestLogger('waitForRequiredChecks');
    // What a `ready_for_review` re-run leaves behind: `concurrency` cancelled the first Build and
    // both runs stay pinned to the same head SHA.
    const client = createClient({
        mergeableStates: ['unstable'],
        checkRuns: [
            [
                { name: 'Build', status: 'completed', conclusion: 'success', check_suite: { id: 200 } },
                { name: 'Build', status: 'completed', conclusion: 'cancelled', check_suite: { id: 100 } },
            ],
        ],
    });

    await waitForRequiredChecks({ client, config: CONFIG, prNumber: 1, logger, intervalMs: 0 });
});

test('keeps waiting when the superseding run of a cancelled check is still in progress', async () => {
    const { logger } = createTestLogger('waitForRequiredChecks');
    const client = createClient({
        mergeableStates: ['blocked', 'unstable'],
        checkRuns: [
            [
                { name: 'Build', status: 'in_progress', conclusion: null, check_suite: { id: 200 } },
                { name: 'Build', status: 'completed', conclusion: 'cancelled', check_suite: { id: 100 } },
            ],
            [
                { name: 'Build', status: 'completed', conclusion: 'success', check_suite: { id: 200 } },
                { name: 'Build', status: 'completed', conclusion: 'cancelled', check_suite: { id: 100 } },
            ],
        ],
    });

    await waitForRequiredChecks({ client, config: CONFIG, prNumber: 1, logger, intervalMs: 0 });
});

test('throws when the newest suite of a check run is the cancelled one', async () => {
    const { logger } = createTestLogger('waitForRequiredChecks');
    const client = createClient({
        mergeableStates: ['blocked'],
        checkRuns: [
            [
                { name: 'Build', status: 'completed', conclusion: 'cancelled', check_suite: { id: 200 } },
                { name: 'Build', status: 'completed', conclusion: 'success', check_suite: { id: 100 } },
            ],
        ],
    });

    await expect(
        waitForRequiredChecks({ client, config: CONFIG, prNumber: 1, logger, intervalMs: 0 }),
    ).rejects.toBeInstanceOf(UsageError);
});
