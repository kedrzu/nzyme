/**
 * Runs `fn` in a new trace scope labelled `label` — call it where an input enters the process (an
 * HTTP request, a WebSocket or queue message) with the label read from that input. Everything `fn`
 * runs, including Effect fibers it starts and async work it awaits, records under the label;
 * `undefined` opens an unlabelled scope. A fiber already running when `fn` is called keeps its own
 * label: only fibers started inside `fn` take this one.
 *
 * Without the `@nzyme/trace/preload` probe it just calls `fn`.
 */
export function traceScope<T>(label: string | undefined, fn: () => T): T {
    const runtime = globalThis.__nzymeTrace;
    return runtime ? runtime.scope(label, fn) : fn();
}
