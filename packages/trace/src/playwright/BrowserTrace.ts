/** The name of the test attachment the `traceTest` fixture writes a {@link BrowserTrace} to. */
export const BROWSER_TRACE_ATTACHMENT = 'nzyme-trace-browser';

/** What the browsers of one test attempt ran and fetched, attached by the `traceTest` fixture. */
export interface BrowserTrace {
    /** Root-relative source files whose functions ran in the test's pages. */
    executed: string[];
    /** Root-relative static assets of the apps' `public/` directories the pages fetched. */
    assets: string[];
    /** Executed sources the served bundles were built before. */
    stale: string[];
    /** Set when the pages ran code whose coverage was lost; then the trace is not complete. */
    incomplete?: string;
}
