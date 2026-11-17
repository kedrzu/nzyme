import type { TraceProcess } from './TraceProcess.js';

/** A test of the run and when it ran, in wall-clock milliseconds. */
export interface TracedTestWindow {
    /** The trace label its requests carry. */
    label: string;
    start: number;
    /** `undefined` while it runs. */
    end?: number;
}

/** Options of {@link attributeExecution}. */
export interface AttributeExecutionOptions {
    /** Labels of the ended tests to attribute; every ended test when omitted. */
    targets?: readonly string[];
}

/** What a run's traced processes executed, per test and at startup. */
export interface ExecutionAttribution {
    /** Per label of each target test. */
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
 * - `no-heartbeat` — a ready process has not flushed past the test's end, and has not ended;
 * - `stale-build` — the test ran `file` from a build older than the file.
 */
export type TraceIncompleteReason =
    | { kind: 'unprobed' }
    | { kind: 'no-heartbeat'; process: string }
    | { kind: 'stale-build'; file: string };

/**
 * Attributes what traced processes executed to the tests of a run. A test owns a hit when the hit
 * carries its label and falls in its window; any other hit — no label, or the label of a test not
 * running then (one that already ended) — belongs to every test whose window covers its bucket.
 * Since a hit's time is known only to its bucket, a window is the test's span widened by one
 * bucket on each side; tests may overlap (parallel workers). Unlabelled hits before the first test
 * started, and every hit a process made before reporting `ready`, are startup code; other hits
 * outside every window are dropped.
 * @__NO_SIDE_EFFECTS__
 */
export function attributeExecution(
    processes: readonly TraceProcess[],
    tests: readonly TracedTestWindow[],
    options: AttributeExecutionOptions = {},
): ExecutionAttribution {
    const byLabel = new Map(tests.map(test => [test.label, test]));
    const targetLabels = options.targets ?? tests.filter(test => test.end !== undefined).map(test => test.label);
    const targets: TracedTestWindow[] = [];
    for (const label of targetLabels) {
        const test = byLabel.get(label);
        if (test?.end !== undefined) {
            targets.push(test);
        }
    }

    const firstStart = Math.min(...tests.map(test => test.start));
    const startup = new Set<string>();
    const executed = new Map(targets.map(test => [test.label, new Set<string>()]));

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
            for (const test of targets) {
                if (overlaps(test, from, to, margin)) {
                    addAll(executed.get(test.label), hit.files);
                }
            }
        }
    }

    const result = new Map<string, TestExecution>();
    for (const test of targets) {
        const files = executed.get(test.label) ?? new Set<string>();
        const reason = findIncompleteReason(processes, test, files, startup);
        result.set(
            test.label,
            reason ? { executed: files, complete: false, reason } : { executed: files, complete: true },
        );
    }
    return { tests: result, startup };
}

function findIncompleteReason(
    processes: readonly TraceProcess[],
    test: TracedTestWindow,
    executed: Set<string>,
    startup: Set<string>,
): TraceIncompleteReason | undefined {
    const ready = processes.filter(process => process.readyAt !== undefined);
    if (ready.length === 0) {
        return { kind: 'unprobed' };
    }

    for (const process of processes) {
        for (const file of process.stale) {
            if (executed.has(file) || startup.has(file)) {
                return { kind: 'stale-build', file };
            }
        }
    }

    const end = test.end ?? Infinity;
    for (const process of ready) {
        const heard = process.endedAt !== undefined || (process.flushedAt ?? -Infinity) >= end + process.bucketMs;
        if (!heard) {
            return { kind: 'no-heartbeat', process: process.name };
        }
    }
    return undefined;
}

/** Whether the bucket `[from, to)` meets the test's window, widened by `margin` on both sides. */
function overlaps(test: TracedTestWindow, from: number, to: number, margin: number): boolean {
    return to > test.start - margin && from <= (test.end ?? Infinity) + margin;
}

function addAll(target: Set<string> | undefined, files: readonly string[]): void {
    if (target) {
        for (const file of files) {
            target.add(file);
        }
    }
}
