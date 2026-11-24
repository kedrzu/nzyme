/** The part of `Worker` options that loads the trace probe into the worker. */
export interface WorkerPreloadOptions {
    preload?: string[];
}

/**
 * Options to spread into `new Worker(path, { ...workerPreloadOptions() })`, so a worker thread is
 * traced like its parent: worker threads do not inherit `--preload`. Empty without the
 * `@nzyme/trace/preload` probe.
 * @__NO_SIDE_EFFECTS__
 */
export function workerPreloadOptions(): WorkerPreloadOptions {
    const runtime = globalThis.__nzymeTrace;
    return runtime ? { preload: [runtime.preloadPath] } : {};
}
