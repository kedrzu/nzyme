import type { TracedTestResult } from '@nzyme/affected/playwright/TracedTestResult.js';
import type { TestSelector } from '@nzyme/affected/selector/openTestSelector.js';
import { getTestUnitKey } from '@nzyme/affected/store/VariantStore.js';
import type { TestUnit } from '@nzyme/affected/store/VariantStore.js';

/** What {@link recordTracedResults} did with the results of a traced run. */
export interface TracedRecording {
    recorded: number;
    /** Passed attempts recorded nothing, counted by reason: an incomplete trace or a refused record. */
    refused: Map<string, number>;
    /** Tests whose last attempt failed. */
    failed: TestUnit[];
    /** Variants removed for failed attempts. */
    invalidated: number;
}

/**
 * Records the results a traced run wrote (`@nzyme/trace`'s Playwright reporter), in order: a passed
 * attempt with a complete trace becomes a variant, a failed one invalidates the test's matching
 * variants, and a passed one with an incomplete trace records nothing. Every variant gets the files
 * any test of the run executed in a server process (`TestRun.runExecuted`).
 */
export async function recordTracedResults(
    selector: TestSelector,
    results: readonly TracedTestResult[],
): Promise<TracedRecording> {
    const recording: TracedRecording = { recorded: 0, refused: new Map(), failed: [], invalidated: 0 };
    const lastFailed = new Map<string, TestUnit | undefined>();
    const runExecuted = collectServerExecuted(results);

    for (const result of results) {
        const key = getTestUnitKey(result.unit);
        if (result.status === 'failed') {
            lastFailed.set(key, result.unit);
            recording.invalidated += await selector.invalidate(result.unit);
            continue;
        }

        lastFailed.set(key, undefined);
        if (!result.complete) {
            countRefusal(recording, result.reason);
            continue;
        }
        const recorded = await selector.record(result.unit, {
            status: 'passed',
            entry: result.entry,
            executed: [...new Set([...result.executed, ...(result.browserExecuted ?? [])])],
            runExecuted,
            startup: result.startup,
            assets: result.assets,
        });
        if (recorded.recorded) {
            recording.recorded++;
        } else {
            countRefusal(recording, recorded.reason.kind);
        }
    }

    for (const unit of lastFailed.values()) {
        if (unit) {
            recording.failed.push(unit);
        }
    }
    return recording;
}

/**
 * Every file a server process of the run executed in a test. Startup files are left out: the suite
 * fingerprint already hashes them in full.
 */
function collectServerExecuted(results: readonly TracedTestResult[]): string[] {
    const executed = new Set<string>();
    for (const result of results) {
        if (result.status === 'passed' && result.complete) {
            for (const file of result.executed) {
                executed.add(file);
            }
        }
    }
    return [...executed];
}

function countRefusal(recording: TracedRecording, reason: string): void {
    recording.refused.set(reason, (recording.refused.get(reason) ?? 0) + 1);
}
