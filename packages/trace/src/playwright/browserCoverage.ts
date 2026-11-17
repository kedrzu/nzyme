import { readFileSync } from 'node:fs';

import type { BuildChecker } from '../probe/createBuildChecker.js';
import { createSourceLocator } from '../probe/createSourceLocator.js';
import { resolveAppFile } from './resolveAppFile.js';
import type { TracedApp } from './TracedApp.js';

/** One script's JavaScript coverage, as Chromium's `page.coverage.stopJSCoverage()` returns it. */
export interface BrowserScriptCoverage {
    url: string;
    source?: string;
    functions: BrowserFunctionCoverage[];
}

/** One function of {@link BrowserScriptCoverage}: its first range spans the whole function. */
export interface BrowserFunctionCoverage {
    functionName: string;
    ranges: { startOffset: number; endOffset: number; count: number }[];
}

/** Parameters of {@link mapBrowserCoverage}. */
export interface MapBrowserCoverageParams {
    coverage: readonly BrowserScriptCoverage[];
    apps: readonly TracedApp[];
    /** Absolute project root. */
    root: string;
    buildChecker: BuildChecker;
}

/** The source files a browser ran, as root-relative paths. */
export interface BrowserExecution {
    /** Sources with at least one function that ran. */
    executed: string[];
    /** Executed sources the bundle that ran them was not built from as they are now. */
    stale: string[];
}

/**
 * Maps Chromium JavaScript coverage to the source files whose functions ran, through the source maps
 * of the apps' built scripts. Only scripts served from an app's origin and found in its
 * `outputDir` are mapped; the top level of a script is not a function run (what it defines is
 * reached through imports).
 */
export function mapBrowserCoverage(params: MapBrowserCoverageParams): BrowserExecution {
    const { coverage, apps, root, buildChecker } = params;
    const executed = new Set<string>();
    const stale = new Set<string>();

    for (const script of coverage) {
        const file = resolveAppFile({ url: script.url, apps, root, dir: 'outputDir' });
        if (file === undefined || !/\.[cm]?js$/.test(file)) {
            continue;
        }

        const code = script.source ?? readFileSync(file, 'utf8');
        const locator = createSourceLocator({ file, code, root, buildChecker });
        const scriptExecuted = new Set<string>();
        for (const fn of script.functions) {
            const range = fn.ranges[0];
            if (
                range === undefined ||
                range.count === 0 ||
                (range.startOffset === 0 && range.endOffset >= code.length)
            ) {
                continue;
            }
            const source = locator.sourceAt(range.startOffset);
            if (source !== undefined) {
                scriptExecuted.add(source);
                executed.add(source);
            }
        }

        for (const source of locator.findStale(scriptExecuted)) {
            stale.add(source);
        }
    }

    return { executed: [...executed], stale: [...stale] };
}
