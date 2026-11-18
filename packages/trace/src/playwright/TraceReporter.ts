import { realpathSync, writeFileSync } from 'node:fs';
import { appendFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';

import type { FullConfig, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';

import { getPlaywrightTestUnit } from '@nzyme/affected/playwright/playwrightTestList.js';
import type { TracedTestResult } from '@nzyme/affected/playwright/TracedTestResult.js';
import type { TestUnit } from '@nzyme/affected/store/VariantStore.js';
import { getProjectRoot } from '@nzyme/project-utils/getProjectRoot.js';
import { relativePosixPath } from '@nzyme/project-utils/relativePosixPath.js';

import { attributeExecution } from '../attribution/attributeExecution.js';
import type { TestExecution, TracedTestWindow } from '../attribution/attributeExecution.js';
import { createTraceDirReader } from '../attribution/createTraceDirReader.js';
import type { TraceDirReader } from '../attribution/createTraceDirReader.js';
import { BROWSER_TRACE_ATTACHMENT } from './BrowserTrace.js';
import type { BrowserTrace } from './BrowserTrace.js';
import { getTestTraceLabel } from './getTestTraceLabel.js';

/** Options of {@link TraceReporter}, the second element of its `reporter` entry. */
export interface TraceReporterOptions {
    /**
     * Where to write the results (absolute): one `TracedTestResult` line per finished test attempt,
     * for `nzyme git affected --record`. The reporter empties it when the run begins.
     */
    resultsFile: string;
    /**
     * The `NZYME_TRACE_DIR` the traced servers of this run write to (absolute). Use a fresh one per
     * run: files of an earlier run would be read as this one's.
     */
    traceDir: string;
    /**
     * Whether this run started the servers it tests. A server already running (a dev server, a reused
     * one) was not started with the probe and its trace is not this run's, so nothing is written.
     */
    ownsServers: boolean;
}

/** How long a passed test waits for every traced process to flush past its end. */
const TRACE_WAIT_MS = 15_000;
const TRACE_POLL_MS = 200;

/**
 * Writes what each test of a traced Playwright run depended on, for `nzyme git affected --record`
 * to record as test variants: the server code its trace label and time window attribute to it (see
 * `attributeExecution`), the browser code and assets of its `traceTest` attachment, and the run's
 * startup code. A line is appended as soon as a test's trace is complete (or the wait for it times
 * out), so an interrupted run keeps what finished. Register it as
 * `['@nzyme/trace/playwright/TraceReporter.js', options]`.
 */
export default class TraceReporter implements Reporter {
    private readonly options: TraceReporterOptions;
    private readonly reader: TraceDirReader;
    private readonly windows = new Map<string, TracedTestWindow>();
    private readonly units = new Map<string, TestUnit>();
    private queue: Promise<void> = Promise.resolve();

    constructor(options: TraceReporterOptions) {
        this.options = options;
        this.reader = createTraceDirReader(options.traceDir);
    }

    onBegin(config: FullConfig, suite: Suite): void {
        if (!this.options.ownsServers) {
            console.warn('[@nzyme/trace] the servers were not started by this run: no test variant is recorded.');
            return;
        }
        writeFileSync(this.options.resultsFile, '');

        const realRoot = realpathSync(getProjectRoot(config.rootDir));
        const realRootDir = realpathSync(config.rootDir);
        for (const test of suite.allTests()) {
            const unit = getPlaywrightTestUnit({
                realRoot,
                realRootDir,
                // As Playwright's JSON report writes it, which `--units` reads.
                location: relativePosixPath(config.rootDir, test.location.file),
                title: [...getDescribeTitles(test), test.title],
            });
            if (unit) {
                this.units.set(test.id, unit);
            }
        }
    }

    onTestBegin(test: TestCase, result: TestResult): void {
        const label = getTestTraceLabel({ testId: test.id, retry: result.retry });
        this.windows.set(label, { label, start: result.startTime.getTime() });
    }

    onTestEnd(test: TestCase, result: TestResult): void {
        const label = getTestTraceLabel({ testId: test.id, retry: result.retry });
        const window = this.windows.get(label);
        if (window) {
            // Not `start + duration`: `duration` counts only the test's timeout slot, without worker
            // fixtures set up on the way (launching the browser), so it ends the window too early. The
            // test ended before the runner heard of it, so now is late, which only widens the window.
            window.end = Date.now();
        }

        const unit = this.units.get(test.id);
        if (!unit || result.status === 'skipped' || result.status === 'interrupted') {
            return;
        }
        const attempt: TestAttemptToDescribe = { test, result, unit, label, deadline: Date.now() + TRACE_WAIT_MS };
        this.queue = this.queue.then(() => this.writeAttempt(attempt));
    }

    async onEnd(): Promise<void> {
        await this.queue;
    }

    printsToStdio(): boolean {
        return false;
    }

    /** Appends the result line of one finished attempt; a failure to trace it is reported, not thrown. */
    private async writeAttempt(attempt: TestAttemptToDescribe): Promise<void> {
        try {
            const line = await this.describeAttempt(attempt);
            if (line) {
                await appendFile(this.options.resultsFile, `${JSON.stringify(line)}\n`);
            }
        } catch (error) {
            console.error(`[@nzyme/trace] tracing "${attempt.test.title}" failed`, error);
        }
    }

    /** The result line of one finished attempt; `undefined` for an expected failure, which says nothing. */
    private async describeAttempt(attempt: TestAttemptToDescribe): Promise<TracedTestResult | undefined> {
        const { test, result, unit, label, deadline } = attempt;
        if (result.status !== test.expectedStatus) {
            return { unit, status: 'failed' };
        }
        if (result.status !== 'passed') {
            return undefined;
        }

        const browser = readBrowserTrace(result);
        if (!browser) {
            return { unit, status: 'passed', complete: false, reason: 'no-browser-trace' };
        }
        if (browser.incomplete !== undefined) {
            return { unit, status: 'passed', complete: false, reason: 'browser-incomplete' };
        }
        if (browser.stale.length > 0) {
            return { unit, status: 'passed', complete: false, reason: 'stale-build' };
        }

        const { execution, startup } = await this.waitForExecution(label, deadline);
        if (!execution.complete) {
            return { unit, status: 'passed', complete: false, reason: execution.reason?.kind ?? 'incomplete' };
        }
        return {
            unit,
            status: 'passed',
            complete: true,
            entry: [unit.file],
            executed: [...execution.executed],
            browserExecuted: browser.executed,
            startup: [...startup],
            assets: browser.assets,
        };
    }

    /** Reads the trace until the test's execution is complete, final, or the deadline passes. */
    private async waitForExecution(label: string, deadline: number) {
        for (;;) {
            const processes = await this.reader.read();
            const attribution = attributeExecution(processes, [...this.windows.values()], { targets: [label] });
            const execution: TestExecution = attribution.tests.get(label) ?? {
                executed: new Set(),
                complete: false,
                reason: { kind: 'unprobed' },
            };
            if (execution.complete || execution.reason?.kind !== 'no-heartbeat' || Date.now() >= deadline) {
                return { execution, startup: attribution.startup };
            }
            await setTimeout(TRACE_POLL_MS);
        }
    }
}

/** One finished attempt, for `TraceReporter.describeAttempt`. */
interface TestAttemptToDescribe {
    test: TestCase;
    result: TestResult;
    unit: TestUnit;
    label: string;
    /** When to stop waiting for the servers' trace (wall-clock milliseconds). */
    deadline: number;
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
