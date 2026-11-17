import { test } from '@playwright/test';
import type { Browser, BrowserContext, LaunchOptions, Page } from '@playwright/test';

import { getProjectRoot } from '@nzyme/project-utils/getProjectRoot.js';

import { createBuildChecker } from '../probe/createBuildChecker.js';
import type { BuildChecker } from '../probe/createBuildChecker.js';

import { TRACE_LABEL_COOKIE, TRACE_LABEL_HEADER } from '../runtime/readTraceLabel.js';
import { mapBrowserAssets } from './browserAssets.js';
import { mapBrowserCoverage } from './browserCoverage.js';
import { BROWSER_TRACE_ATTACHMENT } from './BrowserTrace.js';
import type { BrowserTrace } from './BrowserTrace.js';
import { getTestTraceLabel } from './getTestTraceLabel.js';
import { resolveAppFile } from './resolveAppFile.js';
import type { TracedApp } from './TracedApp.js';

/** Options of {@link traceTest}, set in the Playwright config's `use`. */
export interface TraceTestOptions {
    /**
     * Turns tracing on. An object rather than the array of apps: Playwright would read an array
     * option value as a `[value, fixtureOptions]` tuple.
     */
    nzymeTrace: TraceTestConfig | undefined;
}

/** The value of the `nzymeTrace` option of {@link traceTest}. */
export interface TraceTestConfig {
    /** The apps the tests' browsers load. */
    apps: TracedApp[];
}

/** The per-test fixture of {@link traceTest}; `undefined` with tracing off. */
interface TraceTestFixtures {
    _nzymeBrowserTracer: BrowserTracer | undefined;
}

/** The worker fixtures of {@link traceTest}: its option, and caches shared by the worker's tests. */
interface TraceWorkerFixtures extends TraceTestOptions {
    /** `undefined` with tracing off. */
    _nzymeBuildChecker: BuildChecker | undefined;
}

/** Collects what the browsers of one test attempt run and fetch. */
interface BrowserTracer {
    label: string;
    /** Labels a context with the test's cookie and traces its pages; idempotent. */
    adopt(context: BrowserContext): Promise<void>;
    /** Collects the coverage of the pages still open. */
    finish(): Promise<BrowserTrace>;
}

/**
 * Chromium features that swap the renderer process on a navigation (`page.goto`) and so drop the
 * coverage of the page before it: with them, a test navigating twice loses its first page's code.
 */
const PROCESS_SWAP_FEATURES: readonly string[] = [
    'BackForwardCache',
    'ProactivelySwapBrowsingInstance',
    'RenderDocument',
];

/**
 * A Playwright `test` that traces each test for test selection: every browser context of the test —
 * the `context` fixture and any it creates with `browser.newContext()` — sends the test's trace
 * label (`getTestTraceLabel`) in the `x-nzyme-trace` header and the `nzyme-trace` cookie for
 * `localhost`, and the Chromium JavaScript coverage of its pages and the app assets they fetch are
 * attached to the test result for `TraceReporter`. Re-export it as the suite's `test`, and set
 * `nzymeTrace` in `use`; without it nothing changes.
 */
export const traceTest = test.extend<TraceTestFixtures, TraceWorkerFixtures>({
    nzymeTrace: [undefined, { scope: 'worker', option: true }],

    _nzymeBuildChecker: [
        async ({ nzymeTrace }, use, workerInfo) => {
            await use(nzymeTrace ? await createBuildChecker(getProjectRoot(workerInfo.config.rootDir)) : undefined);
        },
        { scope: 'worker' },
    ],

    launchOptions: [
        async ({ launchOptions, nzymeTrace }, use) => {
            await use(nzymeTrace ? withoutProcessSwaps(launchOptions) : launchOptions);
        },
        { scope: 'worker' },
    ],

    extraHTTPHeaders: async ({ extraHTTPHeaders, nzymeTrace }, use, testInfo) => {
        await use(
            nzymeTrace ? { ...extraHTTPHeaders, [TRACE_LABEL_HEADER]: getTestTraceLabel(testInfo) } : extraHTTPHeaders,
        );
    },

    _nzymeBrowserTracer: [
        async ({ browser, nzymeTrace, _nzymeBuildChecker }, use, testInfo) => {
            if (!nzymeTrace || !_nzymeBuildChecker) {
                await use(undefined);
                return;
            }

            const tracer = createBrowserTracer({
                label: getTestTraceLabel(testInfo),
                apps: nzymeTrace.apps,
                root: getProjectRoot(testInfo.config.rootDir),
                buildChecker: _nzymeBuildChecker,
            });
            const restore = labelNewContexts(browser, tracer);
            let trace: BrowserTrace;
            try {
                await use(tracer);
            } finally {
                restore();
                trace = await tracer.finish();
            }
            await testInfo.attach(BROWSER_TRACE_ATTACHMENT, {
                body: JSON.stringify(trace),
                contentType: 'application/json',
            });
        },
        { auto: true },
    ],

    context: async ({ context, _nzymeBrowserTracer }, use) => {
        await _nzymeBrowserTracer?.adopt(context);
        await use(context);
    },
});

/** Parameters of {@link createBrowserTracer}. */
interface CreateBrowserTracerParams {
    label: string;
    apps: TracedApp[];
    root: string;
    buildChecker: BuildChecker;
}

function createBrowserTracer(params: CreateBrowserTracerParams): BrowserTracer {
    const { label, apps, root, buildChecker } = params;
    const contexts = new Set<BrowserContext>();
    const coverageStarts = new Map<Page, Promise<void>>();
    const collected = new Set<Page>();
    const fetched = new Set<string>();
    /** How many times each script was fetched, and how many coverage entries it has: one per document. */
    const fetchedScripts = new Map<string, number>();
    const coveredScripts = new Map<string, number>();
    /** Service and web worker scripts: page coverage never covers them, and their code is not traced. */
    const workerScripts = new Set<string>();
    const executed = new Set<string>();
    const stale = new Set<string>();
    let incomplete: string | undefined;

    return { adopt, finish, label };

    async function adopt(context: BrowserContext): Promise<void> {
        if (contexts.has(context)) {
            return;
        }
        contexts.add(context);

        await context.addCookies([{ name: TRACE_LABEL_COOKIE, value: label, domain: 'localhost', path: '/' }]);
        context.on('requestfinished', request => {
            const url = request.url();
            fetched.add(url);
            // A request a service worker made is not a page's script.
            if (request.resourceType() === 'script' && !request.serviceWorker()) {
                fetchedScripts.set(url, (fetchedScripts.get(url) ?? 0) + 1);
            }
        });
        context.on('page', page => void startCoverage(page));
        context.on('serviceworker', worker => workerScripts.add(worker.url()));

        const newPage = context.newPage.bind(context);
        context.newPage = async () => {
            const page = await newPage();
            await startCoverage(page);
            return page;
        };
        const close = context.close.bind(context);
        context.close = async options => {
            await Promise.all(context.pages().map(collect));
            await close(options);
        };

        await Promise.all(context.pages().map(startCoverage));
    }

    async function finish(): Promise<BrowserTrace> {
        for (const context of contexts) {
            await Promise.all(context.pages().map(collect));
        }

        for (const context of contexts) {
            for (const worker of context.serviceWorkers()) {
                workerScripts.add(worker.url());
            }
        }
        for (const [url, fetches] of fetchedScripts) {
            if (workerScripts.has(url)) {
                continue;
            }
            // A document whose coverage was lost (its renderer was swapped, or it closed on its own)
            // fetched a script of an app: a gap, not "nothing ran".
            const covered = coveredScripts.get(url) ?? 0;
            if (covered < fetches && resolveAppFile({ url, apps, root, dir: 'outputDir' }) !== undefined) {
                incomplete ??= `the coverage of ${url} was lost`;
            }
        }

        const trace: BrowserTrace = {
            executed: [...executed],
            assets: mapBrowserAssets({ urls: fetched, apps, root }),
            stale: [...stale],
        };
        if (incomplete !== undefined) {
            trace.incomplete = incomplete;
        }
        return trace;
    }

    function startCoverage(page: Page): Promise<void> {
        let started = coverageStarts.get(page);
        if (!started) {
            started = page.coverage.startJSCoverage({ resetOnNavigation: false }).catch((error: unknown) => {
                incomplete ??= `JavaScript coverage did not start: ${String(error)}`;
            });
            coverageStarts.set(page, started);
            page.on('worker', worker => workerScripts.add(worker.url()));

            const closePage = page.close.bind(page);
            page.close = async options => {
                await collect(page);
                await closePage(options);
            };
            page.on('close', () => {
                if (!collected.has(page)) {
                    incomplete ??= `a page closed before its coverage was collected: ${page.url()}`;
                }
            });
        }
        return started;
    }

    async function collect(page: Page): Promise<void> {
        if (collected.has(page)) {
            return;
        }
        collected.add(page);
        await coverageStarts.get(page);
        try {
            const coverage = await page.coverage.stopJSCoverage();
            for (const script of coverage) {
                coveredScripts.set(script.url, (coveredScripts.get(script.url) ?? 0) + 1);
            }
            const execution = mapBrowserCoverage({ coverage, apps, root, buildChecker });
            for (const file of execution.executed) {
                executed.add(file);
            }
            for (const file of execution.stale) {
                stale.add(file);
            }
        } catch (error) {
            incomplete ??= `JavaScript coverage could not be collected: ${String(error)}`;
        }
    }
}

/**
 * Makes `browser.newContext()` label and trace each context it creates, until the returned restore
 * function is called: the worker's browser outlives the test.
 */
function labelNewContexts(browser: Browser, tracer: BrowserTracer): () => void {
    const newContext = browser.newContext.bind(browser);
    browser.newContext = async options => {
        const context = await newContext({
            ...options,
            extraHTTPHeaders: { ...options?.extraHTTPHeaders, [TRACE_LABEL_HEADER]: tracer.label },
        });
        await tracer.adopt(context);
        return context;
    };
    // The prototype's method shows through again.
    return () => Reflect.deleteProperty(browser, 'newContext');
}

function withoutProcessSwaps<TOptions extends Pick<LaunchOptions, 'args'>>(options: TOptions): TOptions {
    const args = [...(options.args ?? [])];
    const index = args.findIndex(arg => arg.startsWith('--disable-features='));
    if (index === -1) {
        args.push(`--disable-features=${PROCESS_SWAP_FEATURES.join(',')}`);
    } else {
        args[index] = [args[index], ...PROCESS_SWAP_FEATURES].join(',');
    }
    return { ...options, args };
}
