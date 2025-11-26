import type { EmitsOptions, ObjectEmitsOptions } from 'vue';

import type { RecordToUnion, UnionToIntersection } from '@nzyme/types';

import { useInstance } from './useInstance.js';

type ShortEmits<T extends object> = UnionToIntersection<
    RecordToUnion<{
        [K in keyof T]: T[K] extends unknown[] ? (evt: K, ...args: T[K]) => void : (evt: K, event: T[K]) => void;
    }>
>;

type EmitFn<Options = ObjectEmitsOptions, Event extends keyof Options = keyof Options> =
    Options extends Array<infer V>
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (event: V, ...args: any[]) => void
        : // eslint-disable-next-line @typescript-eslint/no-empty-object-type
          {} extends Options
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (event: string, ...args: any[]) => void
          : UnionToIntersection<
                {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    [key in Event]: Options[key] extends (...args: infer Args) => any
                        ? (event: key, ...args: Args) => void
                        : // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          Options[key] extends any[]
                          ? (event: key, ...args: Options[key]) => void
                          : // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            (event: key, ...args: any[]) => void;
                }[Event]
            >;
/**
 * Composable that provides access to the emit function for the current component instance.
 * Returns the emit function without type constraints.
 *
 * @returns The emit function from the current component instance
 *
 * @example
 * ```vue
 * <script setup>
 * import { useEmit } from '@nzyme/vue-utils';
 *
 * const emit = useEmit();
 *
 * function handleClick() {
 *   emit('click', { id: 1 });
 * }
 * </script>
 * ```
 */
export function useEmit(): EmitFn;
/**
 * Composable that provides access to the emit function with type constraints.
 * Returns a strongly-typed emit function based on the provided emits options.
 *
 * @template E - The emits options type
 * @param emitOptions - Optional emits options for type inference
 * @returns A strongly-typed emit function
 *
 * @example
 * ```vue
 * <script setup>
 * import { useEmit } from '@nzyme/vue-utils';
 *
 * interface MyEmits {
 *   click: (id: number) => void;
 *   change: (value: string) => void;
 * }
 *
 * const emit = useEmit<MyEmits>();
 *
 * function handleClick() {
 *   emit('click', 123); // Type-safe
 * }
 * </script>
 * ```
 */
export function useEmit<E extends EmitsOptions>(emitOptions?: E): EmitFn<E>;

/**
 * Creates an event emitter function with type inference for event definitions.
 * This overload allows you to define events as an object type without explicit emit options.
 *
 * @returns An emit function with type-safe event handling
 *
 * @example
 * ```ts
 * // Define events as object type
 * type Events = {
 *   userLogin: [userId: string, timestamp: Date];
 *   userLogout: [userId: string];
 *   dataSync: [syncId: string, progress: number];
 * };
 *
 * // Use without explicit options
 * const emit = useEmit<Events>();
 *
 * // Type-safe event emission
 * emit('userLogin', 'user123', new Date());
 * emit('dataSync', 'sync456', 0.75);
 * ```
 */
export function useEmit<E extends object = Record<string, unknown[]>>(): ShortEmits<E>;

export function useEmit() {
    return useInstance().emit;
}
