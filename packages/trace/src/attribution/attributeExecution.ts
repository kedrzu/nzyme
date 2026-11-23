import type { TraceProcess } from './TraceProcess.js';

/** A test attempt of the run and when it ran, in wall-clock milliseconds. */
export interface TracedTestWindow {
    /** The trace label its requests carry. */
    label: string;
    start: number;
    end: number;
}

/** What a run's traced processes executed, per test and at startup. */
export interface ExecutionAttribution {
    /** Per label of each test. */
    tests: Map<string, TestExecution>;
    /**
     * Files run before any test started, or before their process was ready; every test depends on
     * them.
     */
    startup: Set<string>;
}

/** The files the traced processes ran for one test. */
export interface TestExecution {
    executed: Set<string>;
    /** Whether `executed` is everything: when not, record nothing for the test. */
    complete: boolean;
    reason?: TraceIncompleteReason;
}

/**
 * Why a test's execution is not known in full:
 * - `unprobed` — no process reported `ready`: the server was not started with the probe;
 * - `no-heartbeat` — a ready process stopped flushing before the test's end, without ending: it was
 *   killed, or hung, while the test ran;
 * - `stale-build` — a process of the run loaded `file`, built before the source changed. A file whose
 *   only code that ran is its module top level is never in any test's `executed`, yet the test's
 *   variant hashes it, so any stale file makes the whole run incomplete.
 */
export type TraceIncompleteReason =
    | { kind: 'unprobed' }
    | { kind: 'no-heartbeat'; process: string }
    | { kind: 'stale-build'; file: string };

/**
 * Attributes what traced processes executed to the tests of a run, read once its processes
 * stopped. A test owns a hit when the hit carries its label and falls in its window; any other hit
 * — no label, or the label of a test not running then — belongs to every test whose window covers
 * its bucket. Since a hit's time is known only to its bucket, a window is the test's span widened by
 * one bucket on each side; tests may overlap (parallel workers). Unlabelled hits before the first
 * test started, and every hit a process made before reporting `ready`, are startup code; other hits
 * outside every window are dropped.
 * @__NO_SIDE_EFFECTS__
 */
export function attributeExecution(
    processes: readonly TraceProcess[],
    tests: readonly TracedTestWindow[],
): ExecutionAttribution {
    const byLabel = new Map(tests.map(test => [test.label, test]));
    const firstStart = Math.min(...tests.map(test => test.start));
    const startup = new Set<string>();
    const executed = new Map(tests.map(test => [test.label, new Set<string>()]));

    for (const process of processes) {
        const margin = process.bucketMs;
        for (const hit of process.hits) {
            const from = hit.bucket * process.bucketMs;
            const to = from + process.bucketMs;
            const owner = hit.label === null ? undefined : byLabel.get(hit.label);
            if (owner && overlaps(owner, from, to, margin)) {
                addAll(executed.get(owner.label), hit.files);
                continue;
            }
            if (hit.beforeReady) {
                addAll(startup, hit.files);
                continue;
            }
            if (from < firstStart) {
                addAll(startup, hit.files);
            }
            for (const test of tests) {
                if (overlaps(test, from, to, margin)) {
                    addAll(executed.get(test.label), hit.files);
                }
            }
        }
    }

    const runReason = findRunIncompleteReason(processes);
    const result = new Map<string, TestExecution>();
    for (const test of tests) {
        const files = executed.get(test.label) ?? new Set<string>();
        const reason = runReason ?? findHeartbeatGap(processes, test);
        result.set(
            test.label,
            reason ? { executed: files, complete: false, reason } : { executed: files, complete: true },
        );
    }
    return { tests: result, startup };
}

/** What makes every test of the run incomplete. */
function findRunIncompleteReason(processes: readonly TraceProcess[]): TraceIncompleteReason | undefined {
    if (!processes.some(process => process.readyAt !== undefined)) {
        return { kind: 'unprobed' };
    }
    for (const process of processes) {
        for (const file of process.stale) {
            return { kind: 'stale-build', file };
        }
    }
    return undefined;
}

/**
 * A ready process that stopped writing before the test ended, without a clean exit. A flush at the
 * test's end is enough: it holds every hit up to then, and the end is taken late (when the runner
 * heard of it); the bucket of margin the window adds past it only widens what is attributed.
 */
function findHeartbeatGap(
    processes: readonly TraceProcess[],
    test: TracedTestWindow,
): TraceIncompleteReason | undefined {
    for (const process of processes) {
        if (process.readyAt === undefined || process.endedAt !== undefined) {
            continue;
        }
        if ((process.flushedAt ?? -Infinity) < test.end) {
            return { kind: 'no-heartbeat', process: process.name };
        }
    }
    return undefined;
}

/** Whether the bucket `[from, to)` meets the test's window, widened by `margin` on both sides. */
function overlaps(test: TracedTestWindow, from: number, to: number, margin: number): boolean {
    return to > test.start - margin && from <= test.end + margin;
}

function addAll(target: Set<string> | undefined, files: readonly string[]): void {
    if (target) {
        for (const file of files) {
            target.add(file);
        }
    }
}
