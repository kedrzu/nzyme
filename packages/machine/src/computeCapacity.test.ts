import { expect, test } from 'bun:test';

import { GiB } from './byteUnits.js';
import { computeCapacity } from './computeCapacity.js';
import type { CapacityDecision, ComputeCapacityParams } from './computeCapacity.js';

test('grants the largest worker count that fits, capped at max', () => {
    expect(computeCapacity(params({ availableBytes: 20 * GiB, workers: { min: 1, max: 4 } }))).toEqual({
        kind: 'grant',
        workers: 4,
        bytes: 2 * GiB + 4 * GiB,
    });

    // free 7.5 GiB − base 2 GiB = 5.5 GiB → 5 workers of 1 GiB.
    expect(computeCapacity(params({ availableBytes: 7.5 * GiB, workers: { min: 1, max: 8 } }))).toEqual({
        kind: 'grant',
        workers: 5,
        bytes: 7 * GiB,
    });
});

test('counts reserved-but-unused memory of holders as taken, never a negative amount', () => {
    const decision = computeCapacity(
        params({
            availableBytes: 10 * GiB,
            workers: { min: 1, max: 8 },
            holders: [
                // 3 GiB promised and not yet used.
                { bytes: 4 * GiB, currentRssBytes: 1 * GiB },
                // Uses more than it reserved: contributes nothing, and must not hand out extra memory.
                { bytes: 1 * GiB, currentRssBytes: 6 * GiB },
            ],
        }),
    );

    // free = 10 − 3 = 7 GiB → (7 − 2) / 1 = 5 workers.
    expect(decision).toEqual({ kind: 'grant', workers: 5, bytes: 7 * GiB });
});

test('waits when fewer than min workers fit, saying how much is missing', () => {
    const decision = computeCapacity(params({ availableBytes: 5 * GiB, workers: { min: 4, max: 8 } }));

    expectWait(decision, 'missing 1.0 GiB');
});

test('waits while the 1-minute load is at or above the threshold', () => {
    expectWait(computeCapacity(params({ cpu: { cores: 10, load1m: 8.5, load5m: 0, load15m: 0 } })), 'CPU load 8.5');

    expect(computeCapacity(params({ cpu: { cores: 10, load1m: 8.4, load5m: 0, load15m: 0 } })).kind).toBe('grant');
});

test('waits until the settle delay after the previous admission has passed', () => {
    expectWait(computeCapacity(params({ now: 100_000, lastAdmissionAt: 85_000 })), '5s left');

    expect(computeCapacity(params({ now: 105_000, lastAdmissionAt: 85_000 })).kind).toBe('grant');
});

test('never fits when base plus min workers exceeds total memory minus the reserve', () => {
    const decision = computeCapacity(
        params({ totalBytes: 16 * GiB, reserveBytes: 8 * GiB, workers: { min: 7, max: 8 }, availableBytes: 64 * GiB }),
    );

    // 2 + 7 × 1 = 9 GiB > 16 − 8 = 8 GiB, however much is available right now.
    expect(decision.kind).toBe('never-fits');

    expect(
        computeCapacity(params({ totalBytes: 16 * GiB, reserveBytes: 8 * GiB, workers: { min: 6, max: 8 } })).kind,
    ).not.toBe('never-fits');
});

test('grants max workers when a worker costs no memory', () => {
    expect(computeCapacity(params({ memory: { base: 2 * GiB, perWorker: 0 }, workers: { min: 1, max: 3 } }))).toEqual({
        kind: 'grant',
        workers: 3,
        bytes: 2 * GiB,
    });
});

function params(overrides: Partial<ComputeCapacityParams>): ComputeCapacityParams {
    return {
        memory: { base: 2 * GiB, perWorker: 1 * GiB },
        workers: { min: 1, max: 4 },
        availableBytes: 20 * GiB,
        totalBytes: 64 * GiB,
        reserveBytes: 0,
        holders: [],
        cpu: { cores: 10, load1m: 1, load5m: 1, load15m: 1 },
        cpuThreshold: 0.85,
        now: 1_000_000,
        lastAdmissionAt: undefined,
        settleMs: 20_000,
        ...overrides,
    };
}

function expectWait(decision: CapacityDecision, reasonFragment: string): void {
    expect(decision.kind).toBe('wait');
    expect(decision.kind === 'wait' ? decision.reason : '').toContain(reasonFragment);
}
