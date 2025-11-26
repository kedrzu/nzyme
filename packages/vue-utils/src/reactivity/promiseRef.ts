import { ref, watch } from 'vue';
import type { Ref } from 'vue';

/**
 * A reactive reference that combines the functionality of a ref and a promise.
 * It can be initialized with either a value or a promise, and provides methods
 * to update the value asynchronously.
 *
 * @template T The type of value that will be stored in the ref
 * @template TValue The type of the current value (T | undefined by default)
 */
export interface PromiseRef<T, TValue extends T | undefined = T> extends Ref<TValue> {
    /**
     * The current promise that will resolve with the latest value.
     * This is updated whenever the value changes or when update() is called.
     */
    promise: Promise<T>;

    /**
     * The current promise that is pending to be resolved.
     * This is null when the promise already resolved.
     */
    readonly pending: Promise<TValue> | null;

    /**
     * Updates the ref with a new promise. The ref's value will be updated
     * when the promise resolves.
     *
     * @param promise The new promise to update the ref with
     * @returns The wrapped promise that will resolve with the new value
     */
    update(promise: Promise<T>): Promise<T>;
}

/**
 * Creates an empty PromiseRef that can be updated later.
 * Initial value and promise will be undefined.
 */
export function promiseRef<T>(): PromiseRef<T | undefined>;

/**
 * Creates a PromiseRef from a promise. The ref's value will be undefined
 * until the promise resolves.
 *
 * @param promise The promise to initialize the ref with
 */
export function promiseRef<T>(promise: Promise<T>): PromiseRef<T, T | undefined>;

/**
 * Creates a PromiseRef with an initial value. The promise will be
 * pre-resolved with this value.
 *
 * @param value The initial value for the ref
 */
export function promiseRef<T>(value: T): PromiseRef<T>;

/**
 * Implementation of promiseRef that handles all overloads.
 * Creates a reactive reference that combines the functionality of a ref and a promise.
 *
 * @template T The type of value to store in the ref
 * @param promiseOrValue Optional initial promise or value
 * @returns A PromiseRef instance
 *
 * @example
 * ```ts
 * // Empty ref
 * const emptyRef = promiseRef<string>();
 *
 * // From initial value
 * const valueRef = promiseRef('initial');
 * console.log(valueRef.value); // 'initial'
 *
 * // From promise
 * const asyncRef = promiseRef(fetch('/api/data').then(r => r.json()));
 * // asyncRef.value is undefined until promise resolves
 *
 * // Update with new promise
 * await asyncRef.update(fetch('/api/data/new').then(r => r.json()));
 * // Value will update when new promise resolves
 * ```
 */
export function promiseRef<T>(promiseOrValue?: Promise<T | undefined> | T) {
    let promiseRef: Ref<Promise<T | undefined> | null>;
    let valueRef: Ref<T | undefined>;
    if (promiseOrValue instanceof Promise) {
        promiseRef = ref(wrapPromise(promiseOrValue));
        valueRef = ref(undefined);
    } else {
        promiseRef = ref(null);
        valueRef = ref(promiseOrValue) as Ref<T | undefined>;
    }

    let runWatch = true;

    Object.defineProperties(valueRef, {
        promise: {
            get: () => promiseRef.value ?? Promise.resolve(valueRef.value),
            set: (value: Promise<T>) => {
                promiseRef.value = wrapPromise(value);
            },
        },
        pending: {
            get: () => promiseRef.value,
        },
        update: {
            value: update,
        },
    });

    watch(valueRef, value => {
        if (runWatch) {
            promiseRef.value = Promise.resolve(value);
        }
    });

    return valueRef;

    function wrapPromise(promise: Promise<T | undefined>) {
        const wrapped = promise.then(result => {
            if (promiseRef.value === wrapped) {
                try {
                    runWatch = false;
                    valueRef.value = result;
                } finally {
                    runWatch = true;
                }
            }

            return result;
        });

        return wrapped;
    }

    function update(promise: Promise<T | undefined>) {
        const wrapped = wrapPromise(promise);
        promiseRef.value = wrapped;
        return wrapped;
    }
}
