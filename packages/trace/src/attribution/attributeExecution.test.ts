import { expect, test } from 'bun:test';

import { attributeExecution } from './attributeExecution.js';
import type { TestExecution, TracedTestWindow } from './attributeExecution.js';
import type { TraceProcess, TraceProcessHit } from './TraceProcess.js';

// Buckets are 100 ms wide, so a test's window is its span widened by 100 ms on each side.
const A: TracedTestWindow = { label: 'a', start: 10_000, end: 11_000 };
const B: TracedTestWindow = { label: 'b', start: 10_500, end: 12_000 };

test('a labelled hit belongs to its test only, an unlabelled one to every test running in its bucket', () => {
    const server = traceProcess({
        hits: [hit(105, 'a', 'a-only.ts'), hit(108, null, 'shared.ts'), hit(102, null, 'before-b.ts')],
    });

    const { tests } = attributeExecution([server], [A, B]);

    expect(executedBy(tests.get('a'))).toEqual(['a-only.ts', 'before-b.ts', 'shared.ts']);
    expect(executedBy(tests.get('b'))).toEqual(['shared.ts']);
});

test('the label of a test that already ended, or of no test of the run, counts as no label', () => {
    const server = traceProcess({ hits: [hit(115, 'a', 'late-a.ts'), hit(116, 'unknown', 'foreign.ts')] });

    const { tests } = attributeExecution([server], [A, B]);

    expect(executedBy(tests.get('a'))).toEqual([]);
    expect(executedBy(tests.get('b'))).toEqual(['foreign.ts', 'late-a.ts']);
});

test('code before the first test or before its process was ready is startup; later code outside every test is dropped', () => {
    const server = traceProcess({
        hits: [
            hit(50, null, 'boot.ts'),
            hit(105, null, 'lazy-boot.ts', { beforeReady: true }),
            hit(130, null, 'poller.ts'),
        ],
    });

    const { tests, startup } = attributeExecution([server], [A, B]);

    expect([...startup].toSorted()).toEqual(['boot.ts', 'lazy-boot.ts']);
    expect(executedBy(tests.get('a'))).toEqual([]);
    expect(executedBy(tests.get('b'))).toEqual([]);
});

test('a test is complete once every ready process flushed at or past its end, or ended', () => {
    const flushedPast = traceProcess({ flushedAt: 11_000 });
    const ended = traceProcess({ name: 'ended', flushedAt: 10_200, endedAt: 10_200 });
    const neverReady = traceProcess({ name: 'wrapper', readyAt: undefined, flushedAt: 1_000 });

    const complete = attributeExecution([flushedPast, ended, neverReady], [A]).tests.get('a');
    expect(complete?.complete).toBe(true);

    // Killed during the test: its hits after the last flush are lost.
    const killed = traceProcess({ name: 'killed', flushedAt: 10_999 });
    const incomplete = attributeExecution([flushedPast, killed], [A]).tests.get('a');
    expect(incomplete).toMatchObject({ complete: false, reason: { kind: 'no-heartbeat', process: 'killed' } });
});

test('nothing is complete when no process reported ready: the server was not started with the probe', () => {
    const unprobed = traceProcess({ readyAt: undefined, flushedAt: 99_999, endedAt: 99_999 });

    const execution = attributeExecution([unprobed], [A]).tests.get('a');

    expect(execution).toMatchObject({ complete: false, reason: { kind: 'unprobed' } });
});

test('a stale file loaded by any process makes every test of the run incomplete, even one that never ran it', () => {
    // `changed.ts` ran only its module top level: no test, nor startup, has it in its executed files.
    const server = traceProcess({ hits: [hit(105, 'a', 'a-only.ts')], stale: new Set(['changed.ts']) });
    const wrapper = traceProcess({ name: 'wrapper', readyAt: undefined });

    const { tests } = attributeExecution([server, wrapper], [A, B]);

    const expected: TestExecution = {
        executed: new Set(['a-only.ts']),
        complete: false,
        reason: { kind: 'stale-build', file: 'changed.ts' },
    };
    expect(tests.get('a')).toEqual(expected);
    expect(tests.get('b')).toMatchObject({ complete: false, reason: { kind: 'stale-build', file: 'changed.ts' } });
});

function traceProcess(overrides: Partial<TraceProcess>): TraceProcess {
    return {
        name: 'server',
        bucketMs: 100,
        readyAt: 5_000,
        flushedAt: 99_999,
        hits: [],
        stale: new Set(),
        ...overrides,
    };
}

function hit(
    bucket: number,
    label: string | null,
    file: string,
    overrides: Partial<TraceProcessHit> = {},
): TraceProcessHit {
    return { bucket, label, files: [file], beforeReady: false, ...overrides };
}

function executedBy(execution: TestExecution | undefined): string[] {
    return [...(execution?.executed ?? [])].toSorted();
}
