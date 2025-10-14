import type { Injectable } from '../Injectable.js';
import { defineInjectable } from '../Injectable.js';

/**
 * Define a fallback injectable.
 * @param value - Value to define.
 * @returns Fallback injectable.
 */
export function fallback<T>(...injectables: Injectable<T | null | undefined>[]) {
    return defineInjectable({
        resolve: (container, caller) => {
            for (const injectable of injectables) {
                const value = injectable.resolve(container, caller);
                if (value != null) {
                    return value;
                }
            }

            return undefined;
        },
    });
}
