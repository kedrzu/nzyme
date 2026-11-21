/** The name of the test attachment the `traceTest` fixture writes a {@link BrowserTrace} to. */
export const BROWSER_TRACE_ATTACHMENT = 'nzyme-trace-browser';

/** What the browsers of one test attempt ran and fetched, attached by the `traceTest` fixture. */
export interface BrowserTrace {
    /** Root-relative source files whose functions ran in the test's pages. */
    executed: string[];
    /** Root-relative static assets of the apps' `public/` directories the pages fetched. */
    assets: string[];
    /** Sources of the loaded bundles that the bundles were built before (see `BrowserExecution.stale`). */
    stale: string[];
    /** Set when the pages ran code whose coverage was lost; then the trace is not complete. */
    incomplete?: string;
}
