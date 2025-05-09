import type { Injectable } from '../Injectable.js';
import { defineInjectable } from '../Injectable.js';

/**
 * Define a lazy injectable.
 * @param injectable - Injectable to define.
 * @returns Lazy injectable.
 */
export function injectLazy<T>(injectable: Injectable<T>) {
    let value: T | undefined;

    return defineInjectable({
        resolve: container => {
            return () => {
                if (!value) {
                    value = container.resolve(injectable);
                }

                return value;
            };
        },
    });
}
