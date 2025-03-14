import { defineInjectable } from '../Injectable.js';

/**
 * Injectable that resolves to the name of the caller.
 */
export function callerName() {
    return defineInjectable({
        resolve: (_container, caller) => {
            return caller?.name;
        },
    });
}
