import type * as EffectModule from 'effect/Effect';
import type * as FiberModule from 'effect/Fiber';
import type * as QueueModule from 'effect/Queue';

import { currentTraceLabel } from '../runtime/currentTraceLabel.js';
import { traceScope } from '../runtime/traceScope.js';

/** The consumer's own `effect` modules: `import { Effect, Fiber, Queue } from 'effect'`. */
export interface CheckEffectLabelPropagationParams {
    Effect: typeof EffectModule;
    Fiber: typeof FiberModule;
    Queue: typeof QueueModule;
}

/**
 * Proves that trace labels follow Effect fibers in the given `effect` version. The probe has no
 * Effect integration of its own: it relies on Effect 4 capturing the AsyncLocalStorage context when
 * a fiber is forked and restoring it whenever the fiber resumes, so an upgrade that drops that would
 * silently lose labels. Run it in a test against the `effect` the product pins, in a process started
 * with the `@nzyme/trace/preload` probe; it rejects without the probe.
 *
 * The scenario mirrors a backend: concurrent requests, each in its own `traceScope`, fork fibers that
 * yield and sleep and run `Effect.promise` thunks with awaits — all must see the request's label —
 * and feed a long-lived mailbox fiber started before any label, which must stay unlabelled.
 */
export async function checkEffectLabelPropagation(params: CheckEffectLabelPropagationParams): Promise<void> {
    const { Effect, Fiber, Queue } = params;
    if (globalThis.__nzymeTrace === undefined) {
        throw new Error(
            'checkEffectLabelPropagation needs the @nzyme/trace probe: run it in a process started with ' +
                'BUN_OPTIONS="--preload=<@nzyme/trace/preload>" and NZYME_TRACE_DIR set.',
        );
    }

    const mismatches: string[] = [];
    let observations = 0;

    const mailbox = Effect.runSync(Queue.unbounded<() => void>());
    const mailboxFiber = Effect.runFork(
        Effect.forever(
            Effect.gen(function* () {
                const done = yield* Queue.take(mailbox);
                yield* Effect.sleep(1);
                observe('mailbox fiber started before any label', undefined);
                yield* Effect.promise(async () => {
                    await delay(1);
                    observe('mailbox fiber, Effect.promise continuation', undefined);
                });
                done();
            }),
        ),
    );

    try {
        await Promise.all(
            Array.from({ length: 40 }, (_, index) => {
                const label = `request-${index % 8}`;
                return traceScope(label, () => runRequest(label, index));
            }),
        );
    } finally {
        await Effect.runPromise(Fiber.interrupt(mailboxFiber));
    }

    if (mismatches.length > 0) {
        throw new Error(
            `Trace labels do not follow Effect fibers in this effect version: ${mismatches.length} of ` +
                `${observations} observations wrong. Effect no longer carries the AsyncLocalStorage ` +
                `context of a fork into the fiber and its resumptions, so @nzyme/trace would attribute ` +
                `fiber work to the wrong test. For example:\n${mismatches.slice(0, 10).join('\n')}`,
        );
    }

    async function runRequest(label: string, index: number) {
        await Effect.runPromise(
            Effect.gen(function* () {
                yield* Effect.all(
                    [0, 1, 2].map(child =>
                        Effect.gen(function* () {
                            yield* Effect.sleep((index + child) % 4);
                            observe('concurrent fiber after a sleep', label);
                            yield* Effect.promise(async () => {
                                observe('Effect.promise thunk', label);
                                await delay((index * 3 + child) % 3);
                                observe('Effect.promise continuation', label);
                            });
                            observe('concurrent fiber after Effect.promise', label);
                        }),
                    ),
                    { concurrency: 'unbounded' },
                );

                const forked = yield* Effect.forkChild(
                    Effect.gen(function* () {
                        yield* Effect.yieldNow;
                        yield* Effect.sleep(index % 3);
                        observe('forked fiber after a yield and a sleep', label);
                    }),
                );
                yield* Fiber.join(forked);
            }),
        );
        observe('after Effect.runPromise', label);

        await new Promise<void>(resolve => {
            Effect.runSync(Queue.offer(mailbox, resolve));
        });
        observe('after the mailbox fiber replied', label);
    }

    function observe(where: string, expected: string | undefined) {
        observations++;
        const actual = currentTraceLabel();
        if (actual !== expected) {
            mismatches.push(`${where}: expected ${expected ?? 'no label'}, got ${actual ?? 'no label'}`);
        }
    }
}

function delay(ms: number) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}
