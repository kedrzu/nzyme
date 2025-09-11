import type { EmitsOptions, ObjectEmitsOptions } from 'vue';

import type { UnionToIntersection } from '@nzyme/types';

import { useInstance } from './useInstance.js';

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

export function useEmit() {
    return useInstance().emit;
}
