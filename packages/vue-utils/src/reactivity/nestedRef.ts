import { computed, isReadonly } from 'vue';
import type { Ref } from 'vue';

/**
 * Creates a computed ref that accesses a nested property of another ref.
 * The returned ref is writable and changes will propagate to the parent ref.
 *
 * @param ref - The parent ref containing the property
 * @param key - The property key to access
 * @returns A writable computed ref for the nested property
 *
 * @example
 * ```ts
 * const user = ref({ name: 'John', age: 30 });
 * const name = nestedRef(user, 'name');
 *
 * console.log(name.value); // 'John'
 * name.value = 'Jane'; // Updates user.value.name
 * ```
 */
export function nestedRef<T, K extends keyof T>(ref: Ref<T>, key: K): Ref<T[K]>;
/**
 * Creates a readonly computed ref that accesses a nested property of a readonly ref.
 * The returned ref cannot be modified.
 *
 * @param ref - The readonly parent ref containing the property
 * @param key - The property key to access
 * @returns A readonly computed ref for the nested property
 *
 * @example
 * ```ts
 * const user = readonly(ref({ name: 'John', age: 30 }));
 * const name = nestedRef(user, 'name');
 *
 * console.log(name.value); // 'John'
 * // name.value = 'Jane'; // TypeScript error - readonly
 * ```
 */
export function nestedRef<T, K extends keyof T>(ref: Readonly<Ref<T>>, key: K): Readonly<Ref<T[K]>>;
/**
 * Implementation function that creates a computed ref for nested property access.
 * Automatically determines if the returned ref should be writable or readonly based on the parent ref.
 *
 * @param ref - The parent ref (writable or readonly)
 * @param key - The property key to access
 * @returns A computed ref (writable or readonly depending on input)
 */
export function nestedRef<T, K extends keyof T>(ref: Readonly<Ref<T>> | Ref<T>, key: K) {
    if (isReadonly(ref)) {
        return computed(() => ref.value[key]);
    }

    return computed({
        get: () => ref.value[key],
        set: value => (ref.value[key] = value),
    });
}
