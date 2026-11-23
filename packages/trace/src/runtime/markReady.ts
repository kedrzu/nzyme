/**
 * Marks the end of the process's startup: what ran before it is startup code, which every test
 * depends on. Call it once the process serves requests. Does nothing without the
 * `@nzyme/trace/preload` probe.
 */
export function markReady(): void {
    globalThis.__nzymeTrace?.markReady();
}
