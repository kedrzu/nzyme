import type { Injectable } from '../Injectable.js';
import { defineInjectable } from '../Injectable.js';

/**
 * Define a lazy injectable.
 *
 * The injected getter resolves the wrapped injectable on first call and caches it per resolution,
 * so every container resolving the lazy injectable gets its own getter and its own instance.
 * @param injectable - Injectable to define.
 * @returns Lazy injectable.
 */
export function injectLazy<T>(injectable: Injectable<T>) {
    return defineInjectable({
        resolve: container => {
            let resolved = false;
            let value: T;

            return () => {
                if (!resolved) {
                    value = container.resolve(injectable);
                    resolved = true;
                }

                return value;
            };
        },
    });
}
