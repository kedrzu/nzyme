import { reactive as reactiveVue } from 'vue';
import type { Ref } from 'vue';

/**
 * Type representing an object where values can be either refs or direct values.
 * This allows for flexible input where some properties can be reactive (refs)
 * while others can be static values.
 *
 * @template T The base object type whose values can be either refs or direct values
 */
export type ReactiveInput<T extends object> = {
    [K in keyof T]: Ref<T[K]> | T[K];
};

/**
 * Interface for the reactive function that creates a reactive object from a mix
 * of refs and direct values.
 */
interface Reactive {
    /**
     * Creates a reactive object from an input object containing refs or direct values.
     *
     * @template T The type of the resulting reactive object
     * @param value An object where values can be either refs or direct values
     * @returns A reactive object where all properties are unwrapped (no .value needed)
     *
     * @example
     * ```ts
     * const count = ref(0);
     * const obj = reactive({
     *   count,           // ref
     *   name: 'John',    // direct value
     *   age: ref(25)     // ref
     * });
     * // Access values directly without .value
     * console.log(obj.count);  // 0
     * console.log(obj.name);   // 'John'
     * console.log(obj.age);    // 25
     * ```
     */
    <T extends object>(value: ReactiveInput<T>): T;
}

/**
 * Re-export of vue reactive funtion with option to define the output type.
 */
export const reactive = reactiveVue as Reactive;
