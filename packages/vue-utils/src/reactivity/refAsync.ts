import { ref } from 'vue';
import type { Ref } from 'vue';

import { writable } from '@nzyme/utils/writable.js';

/**
 * Represents a reactive reference that is asynchronously populated with a promise result.
 * The ref's value will be undefined until the promise resolves.
 *
 * @template T The type of value that will be stored in the ref once the promise resolves
 */
export interface RefAsync<T> extends Ref<T | undefined> {
    /**
     * The original promise that will resolve with the value.
     * This can be used to await the value or chain additional promise operations.
     */
    readonly promise: Promise<T>;
}

/**
 * Creates a ref that is populated with a promise result once it's resolved.
 * The ref's value will be undefined until the promise resolves.
 *
 * @template T The type of value that will be stored in the ref
 * @param promise The promise whose result will populate the ref
 * @returns A RefAsync object containing both the ref and the original promise
 *
 * @example
 * ```ts
 * const dataRef = refAsync(fetch('/api/data').then(r => r.json()));
 * // dataRef.value is undefined initially
 * // Once promise resolves, dataRef.value will contain the API response
 * // You can also await the result using dataRef.promise
 * ```
 */
export function refAsync<T>(promise: Promise<T>): RefAsync<T>;
/**
 * Creates a ref that is populated with a promise result once it's resolved.
 * The ref's value will be undefined until the promise resolves.
 *
 * @template T The type of value that will be stored in the ref
 * @param fcn A function that returns a promise whose result will populate the ref
 * @returns A RefAsync object containing both the ref and the original promise
 *
 * @example
 * ```ts
 * const dataRef = refAsync(() => fetch('/api/data').then(r => r.json()));
 * // The function is called immediately and the promise is created
 * // dataRef.value is undefined initially
 * // Once promise resolves, dataRef.value will contain the API response
 * ```
 */
export function refAsync<T>(fcn: () => Promise<T>): RefAsync<T>;
/**
 * Creates a ref that is populated with a promise result once it's resolved.
 * The ref's value will be undefined until the promise resolves.
 *
 * @template T The type of value that will be stored in the ref
 * @param promise The promise whose result will populate the ref
 * @returns A RefAsync object containing both the ref and the original promise
 */
export function refAsync<T>(promise: (() => Promise<T>) | Promise<T>): RefAsync<T> {
    const reference = ref<T>() as RefAsync<T>;

    if (typeof promise === 'function') {
        promise = promise();
    }

    writable(reference).promise = promise;

    void promise.then(result => {
        reference.value = result;
    });

    return reference;
}
