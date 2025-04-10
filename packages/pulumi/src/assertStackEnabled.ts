import type { Stack } from './defineStack.js';

/**
 * Assert that the stack is enabled.
 */
export function assertStackEnabled(stack: Stack) {
    if (!stack.enabled) {
        throw new Error(`Stack ${stack.name} is disabled.`);
    }
}
