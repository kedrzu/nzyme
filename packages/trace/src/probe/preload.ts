/**
 * The `@nzyme/trace/preload` entry. Load it into a Bun process with
 * `BUN_OPTIONS="--preload=<absolute path>"` (the `=` form: with a space `bun run` breaks), and set
 * `NZYME_TRACE_DIR` to the directory the trace files go to. With `NZYME_TRACE_DIR` unset it does
 * nothing at all. Child processes inherit both variables and are traced too; worker threads need
 * `workerPreloadOptions()`.
 */

const traceDir = process.env.NZYME_TRACE_DIR;
// A second load of the preload (twice in BUN_OPTIONS) must not instrument and record everything twice.
// oxlint-disable-next-line nzyme/no-module-state -- a preload exists to install the probe into the process as it loads.
if (traceDir && globalThis.__nzymeTrace === undefined) {
    // Imported lazily, so a process that loads the preload without tracing never loads the parser.
    const { installProbe } = await import('./installProbe.js');
    await installProbe({ traceDir, preloadPath: import.meta.path });
}
