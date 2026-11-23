/**
 * The label of the current trace scope, to carry it across a process boundary (a NATS envelope, a
 * queue message attribute) where the receiving side opens its own `traceScope` with it. `undefined`
 * outside a labelled scope and always without the `@nzyme/trace/preload` probe.
 * @__NO_SIDE_EFFECTS__
 */
export function currentTraceLabel(): string | undefined {
    return globalThis.__nzymeTrace?.currentLabel();
}
