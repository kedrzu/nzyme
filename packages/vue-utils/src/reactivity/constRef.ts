import { customRef } from 'vue';
import type { Ref } from 'vue';

/**
 * Creates a readonly ref that is not tracked by Vue's reactivity system.
 * This is useful when you want to create a ref that holds a constant value
 * and you want to ensure that Vue doesn't waste resources tracking it for changes.
 *
 * @template T The type of value to be contained in the ref
 * @param value The constant value to be stored in the ref
 * @returns A readonly ref containing the constant value
 *
 * @example
 * ```ts
 * const constantValue = constRef('This value never changes');
 * // Reading works normally
 * console.log(constantValue.value); // "This value never changes"
 * // But changes are ignored
 * constantValue.value = 'New value'; // No effect
 * ```
 */
export function constRef<T>(value: T): Readonly<Ref<T>> {
    return customRef(() => ({
        get() {
            return value;
        },
        set() {},
    }));
}
