import { readFile } from 'node:fs/promises';

import { isErrorCode } from '@nzyme/utils/isErrorCode.js';

import type { TestUnit } from '../store/VariantStore.js';

/**
 * One line of a traced run's results file (NDJSON, one line per finished test attempt, appended as
 * it finishes), written by `@nzyme/trace`'s Playwright reporter and recorded by `nzyme git affected
 * --record`. Paths are root-relative.
 */
export type TracedTestResult = TracedTestFailed | TracedTestIncomplete | TracedTestTraced;

/** An attempt that did not end as expected: its matching variants are invalidated. */
export interface TracedTestFailed {
    unit: TestUnit;
    status: 'failed';
}

/** A passed attempt whose trace is not complete: nothing is recorded for it. */
export interface TracedTestIncomplete {
    unit: TestUnit;
    status: 'passed';
    complete: false;
    /** Why, e.g. `no-heartbeat`, `stale-build`, `unprobed`, `no-browser-trace`, `browser-incomplete`. */
    reason: string;
}

/** A passed attempt with its full trace: recorded as a variant. */
export interface TracedTestTraced {
    unit: TestUnit;
    status: 'passed';
    complete: true;
    /** The test's file; its imports are followed. */
    entry: string[];
    /** Files whose functions ran for this test in a server process (the probe's trace). */
    executed: string[];
    /**
     * Files whose functions ran for this test in its browser. Kept apart from `executed` because
     * only server-side execution can leave state behind for later tests (see `TestRun.runExecuted`).
     * A line without it was written before the split: its `executed` holds both, read as server-side.
     */
    browserExecuted?: string[];
    /** Files the run executed at startup, before any test; every test depends on them. */
    startup: string[];
    assets: string[];
}

/**
 * Reads a results file. A missing file reads as empty (no test finished), and so does a last line
 * cut by an interrupted write.
 */
export async function readTracedTestResults(file: string): Promise<TracedTestResult[]> {
    let text: string;
    try {
        text = await readFile(file, 'utf8');
    } catch (error) {
        if (isErrorCode(error, 'ENOENT')) {
            return [];
        }
        throw error;
    }

    const results: TracedTestResult[] = [];
    for (const line of text.split('\n')) {
        if (line === '') {
            continue;
        }
        try {
            // Written by the trace reporter: its lines are trusted to match the type.
            results.push(JSON.parse(line) as TracedTestResult);
        } catch {
            // Only the last line can be cut short, by a run killed mid-write.
            break;
        }
    }
    return results;
}
