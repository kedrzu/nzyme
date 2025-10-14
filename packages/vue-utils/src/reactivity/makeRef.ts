import { computed, isRef, ref } from 'vue';
import type { Ref } from 'vue';

/**
 * A type representing a value that can be converted to a Vue ref.
 * Can be either:
 * - A function returning a value of type T
 * - A readonly ref containing a value of type T
 * - A direct value of type T
 *
 * @template T The type of value contained in the ref
 */
export type RefParam<T> = ((this: void) => T) | Readonly<Ref<T>> | T;

/**
 * An object type where all properties are RefParam types.
 * Used for creating reactive objects where each property can be defined
 * as a function, ref, or direct value.
 *
 * @template T The object type whose properties will be converted to RefParams
 */
export type RefParams<T extends object> = {
    [K in keyof T]-?: RefParam<T[K]>;
};

/**
 * Creates a readonly ref from various input types.
 *
 * @template T The type of value to be contained in the returned ref
 * @param param The input value, which can be:
 *             - A function that returns a value (converted to computed)
 *             - An existing ref (returned as-is)
 *             - A direct value (wrapped in a new ref)
 * @returns A readonly ref containing the value
 *
 * @example
 * ```ts
 * // From a direct value
 * const directRef = makeRef(42);
 *
 * // From a function (becomes computed)
 * const computedRef = makeRef(() => someValue * 2);
 *
 * // From an existing ref (returned as-is)
 * const existingRef = ref(10);
 * const sameRef = makeRef(existingRef);
 * ```
 */
export function makeRef<T>(param: RefParam<T>): Readonly<Ref<T>> {
    if (isRef(param)) {
        return param;
    }

    if (param instanceof Function || typeof param === 'function') {
        return computed(param as (this: void) => T);
    }

    return ref(param) as Readonly<Ref<T>>;
}
