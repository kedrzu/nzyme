import { realpathSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';

import type { FullConfig, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';

import { getPlaywrightTestUnit } from '@nzyme/affected/playwright/playwrightTestList.js';
import type { TracedTestResult } from '@nzyme/affected/playwright/TracedTestResult.js';
import type { TestUnit } from '@nzyme/affected/store/VariantStore.js';
import { getProjectRoot } from '@nzyme/project-utils/getProjectRoot.js';
import { relativePosixPath } from '@nzyme/project-utils/relativePosixPath.js';

import { attributeExecution } from '../attribution/attributeExecution.js';
import type { ExecutionAttribution, TracedTestWindow } from '../attribution/attributeExecution.js';
import { readTraceDir } from '../attribution/readTraceDir.js';
import { BROWSER_TRACE_ATTACHMENT } from './BrowserTrace.js';
import type { BrowserTrace } from './BrowserTrace.js';
import { getTestTraceLabel } from './getTestTraceLabel.js';

/** Options of {@link TraceReporter}, the second element of its `reporter` entry. */
export interface TraceReporterOptions {
    /**
     * Where to write the results (absolute): one `TracedTestResult` line per finished test attempt,
     * for `nzyme git affected-record`. The reporter empties it when the run begins.
     */
    resultsFile: string;
    /**
     * The `NZYME_TRACE_DIR` the traced servers of this run write to (absolute). Use a fresh one per
     * run: files of an earlier run would be read as this one's. A server this run did not start (a dev
     * server, a reused one) writes nothing here, so every attempt reads as `unprobed`: passes are not
     * recorded, failures still are.
     */
    traceDir: string;
}

/**
 * Writes what each test of a traced Playwright run depended on, for `nzyme git affected-record`
 * to record as test variants: the server code its trace label and time window attribute to it (see
 * `attributeExecution`), the browser code and assets of its `traceTest` attachment, and the run's
 * startup code. The results are written once the run ends: Playwright stops the web servers before
 * it calls `onEnd`, so the trace directory is read once, complete. Register it as
 * `['@nzyme/trace/playwright/TraceReporter.js', options]`.
 */
export default class TraceReporter implements Reporter {
    private readonly options: TraceReporterOptions;
    private readonly units = new Map<string, TestUnit>();
    private readonly attempts: FinishedAttempt[] = [];

    constructor(options: TraceReporterOptions) {
        this.options = options;
    }

    onBegin(config: FullConfig, suite: Suite): void {
        // Emptied now, so a run that dies before `onEnd` leaves no earlier run's results behind.
        writeFileSync(this.options.resultsFile, '');

        const realRoot = realpathSync(getProjectRoot(config.rootDir));
        const realRootDir = realpathSync(config.rootDir);
        for (const test of suite.allTests()) {
            const unit = getPlaywrightTestUnit({
                realRoot,
                realRootDir,
                // As Playwright's JSON report writes it, which `nzyme git affected-test-list --units` reads.
                location: relativePosixPath(config.rootDir, test.location.file),
                title: [...getDescribeTitles(test), test.title],
            });
            if (unit) {
                this.units.set(test.id, unit);
            }
        }
    }

    onTestEnd(test: TestCase, result: TestResult): void {
        this.attempts.push({
            test,
            result,
            window: {
                label: getTestTraceLabel({ testId: test.id, retry: result.retry }),
                start: result.startTime.getTime(),
                // Not `start + duration`: `duration` counts only the test's timeout slot, without worker
                // fixtures set up on the way (launching the browser), so it ends the window too early.
                // The test ended before the runner heard of it, so now is late, which only widens the
                // window.
                end: Date.now(),
            },
        });
    }

    async onEnd(): Promise<void> {
        try {
            const lines = await this.describeRun();
            await writeFile(this.options.resultsFile, lines.map(line => `${JSON.stringify(line)}\n`).join(''));
        } catch (error) {
            console.error('[@nzyme/trace] writing the traced results failed', error);
        }
    }

    printsToStdio(): boolean {
        return false;
    }

    /** The result lines of the run, attributed from the trace in one pass. */
    private async describeRun(): Promise<TracedTestResult[]> {
        const attribution = attributeExecution(
            await readTraceDir(this.options.traceDir),
            this.attempts.map(attempt => attempt.window),
        );
        const browsers = new Map(this.attempts.map(attempt => [attempt, readBrowserTrace(attempt.result)]));
        // A test's variant hashes files it never ran a function of: one stale bundle the run loaded
        // anywhere makes every attempt's trace unreliable, as a stale server file does.
        const browserStale = [...browsers.values()].some(browser => (browser?.stale.length ?? 0) > 0);

        const lines: TracedTestResult[] = [];
        for (const attempt of this.attempts) {
            const unit = this.units.get(attempt.test.id);
            if (!unit) {
                continue;
            }
            const line = describeAttempt({
                attempt,
                unit,
                attribution,
                browser: browsers.get(attempt),
                browserStale,
            });
            if (line) {
                lines.push(line);
            }
        }
        return lines;
    }
}

/** One attempt the runner finished, kept for `onEnd`. */
interface FinishedAttempt {
    test: TestCase;
    result: TestResult;
    window: TracedTestWindow;
}

/** Parameters of {@link describeAttempt}. */
interface DescribeAttemptParams {
    attempt: FinishedAttempt;
    unit: TestUnit;
    attribution: ExecutionAttribution;
    browser: BrowserTrace | undefined;
    /** Whether any attempt of the run loaded a stale bundle. */
    browserStale: boolean;
}

/**
 * The result line of one attempt; `undefined` for one that says nothing (skipped, interrupted, or an
 * expected failure). Every line carries the server code the attempt ran, so the run's
 * `runExecuted` holds it whatever the attempt's outcome.
 */
function describeAttempt(params: DescribeAttemptParams): TracedTestResult | undefined {
    const { attempt, unit, attribution, browser, browserStale } = params;
    const { test, result, window } = attempt;
    const execution = attribution.tests.get(window.label);
    const executed = [...(execution?.executed ?? [])];

    if (isFailure(test, result)) {
        return { unit, status: 'failed', executed };
    }
    if (result.status !== 'passed') {
        return undefined;
    }
    if (!browser) {
        return { unit, status: 'passed', complete: false, reason: 'no-browser-trace', executed };
    }
    if (browser.incomplete !== undefined) {
        return { unit, status: 'passed', complete: false, reason: 'browser-incomplete', executed };
    }
    if (browserStale) {
        return { unit, status: 'passed', complete: false, reason: 'stale-build', executed };
    }
    if (!execution?.complete) {
        return { unit, status: 'passed', complete: false, reason: execution?.reason?.kind ?? 'unprobed', executed };
    }
    return {
        unit,
        status: 'passed',
        complete: true,
        entry: [unit.file],
        executed,
        browserExecuted: browser.executed,
        startup: [...attribution.startup],
        assets: browser.assets,
    };
}

/** An attempt that did not end as expected; a skipped or interrupted one is neither. */
function isFailure(test: TestCase, result: TestResult): boolean {
    return result.status !== 'skipped' && result.status !== 'interrupted' && result.status !== test.expectedStatus;
}

function getDescribeTitles(test: TestCase): string[] {
    const titles: string[] = [];
    for (let suite: Suite | undefined = test.parent; suite?.type === 'describe'; suite = suite.parent) {
        titles.unshift(suite.title);
    }
    return titles;
}

function readBrowserTrace(result: TestResult): BrowserTrace | undefined {
    const attachment = result.attachments.find(each => each.name === BROWSER_TRACE_ATTACHMENT);
    if (!attachment?.body) {
        return undefined;
    }
    // Written by the `traceTest` fixture of this package.
    return JSON.parse(attachment.body.toString('utf8')) as BrowserTrace;
}
