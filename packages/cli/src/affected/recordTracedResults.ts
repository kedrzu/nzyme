import type { TracedTestResult } from '@nzyme/affected/playwright/TracedTestResult.js';
import type { TestSelector } from '@nzyme/affected/selector/openTestSelector.js';
import { getTestUnitKey } from '@nzyme/affected/store/VariantStore.js';
import type { TestUnit } from '@nzyme/affected/store/VariantStore.js';

/** What {@link recordTracedResults} did with the results of a traced run. */
export interface TracedRecording {
    recorded: number;
    /** Passed attempts recorded nothing, counted by reason: an incomplete trace or a refused record. */
    refused: Map<string, number>;
    /** Tests with a failed attempt in the run. */
    failed: TestUnit[];
    /** Variants removed for failed attempts. */
    invalidated: number;
}

/** Options of {@link recordTracedResults}. */
export interface RecordTracedResultsOptions {
    /** Only invalidate for the failed tests and record nothing: the run has no snapshot to record against. */
    invalidateOnly?: boolean;
}

/**
 * Records the results a traced run wrote (`@nzyme/trace`'s Playwright reporter): a test with a failed
 * attempt anywhere in the run (`--retries`, `--repeat-each`) records nothing and invalidates its
 * matching variants, whatever its other attempts did, so a flaky test keeps running instead of being
 * skipped on its lucky attempt. A passed attempt of any other test with a complete trace becomes a
 * variant; one with an incomplete trace records nothing. Every variant gets the files any attempt of
 * the run, failed and incomplete ones included, executed in a server process (`TestRun.runExecuted`):
 * a lazy singleton the first test initialized serves every later one, whatever that first test's
 * outcome.
 */
export async function recordTracedResults(
    selector: TestSelector,
    results: readonly TracedTestResult[],
    options: RecordTracedResultsOptions = {},
): Promise<TracedRecording> {
    const recording: TracedRecording = { recorded: 0, refused: new Map(), failed: [], invalidated: 0 };
    const failed = new Map<string, TestUnit>();
    for (const result of results) {
        if (result.status === 'failed') {
            failed.set(getTestUnitKey(result.unit), result.unit);
        }
    }
    const runExecuted = collectServerExecuted(results);

    for (const unit of failed.values()) {
        recording.failed.push(unit);
        recording.invalidated += await selector.invalidate(unit);
    }
    if (options.invalidateOnly) {
        return recording;
    }

    for (const result of results) {
        if (result.status === 'failed' || failed.has(getTestUnitKey(result.unit))) {
            continue;
        }
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

    return recording;
}

/**
 * Every file a server process of the run executed in a test attempt, whatever its outcome. Startup
 * files are left out: the suite fingerprint already hashes them in full.
 */
function collectServerExecuted(results: readonly TracedTestResult[]): string[] {
    const executed = new Set<string>();
    for (const result of results) {
        for (const file of result.executed) {
            executed.add(file);
        }
    }
    return [...executed];
}

function countRefusal(recording: TracedRecording, reason: string): void {
    recording.refused.set(reason, (recording.refused.get(reason) ?? 0) + 1);
}
