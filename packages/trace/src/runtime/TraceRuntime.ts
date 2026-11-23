/**
 * The probe's side of the label API. The `@nzyme/trace/preload` probe installs it on `globalThis`;
 * a process started without the probe never has it, so the exported runtime functions fall back to
 * doing nothing and production code pays nothing for calling them.
 */
export interface TraceRuntime {
    /** Runs `fn` in a new scope labelled `label`; `undefined` opens an unlabelled scope. */
    scope<T>(label: string | undefined, fn: () => T): T;
    currentLabel(): string | undefined;
    markReady(): void;
    /** Absolute path of the preload module, for worker threads, which do not inherit preloads. */
    preloadPath: string;
}

declare global {
    /** Installed by the `@nzyme/trace/preload` probe when it is active. */
    var __nzymeTrace: TraceRuntime | undefined;
    /** The call the probe inserts at the entry of every instrumented function. */
    var __nzymeTraceHit: ((fileId: number) => void) | undefined;
}
