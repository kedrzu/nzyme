import type { StackDefinition } from './defineStack.js';

/**
 * Assert that the stack is enabled.
 */
export function assertStackEnabled(stack: StackDefinition) {
    if (!stack.enabled) {
        throw new Error(`Stack ${stack.name} is disabled.`);
    }
}
