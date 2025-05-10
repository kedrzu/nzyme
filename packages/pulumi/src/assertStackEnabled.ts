import type { Stack, StackOutput } from './defineStack.js';

/**
 * Assert that the stack is enabled.
 */
export function assertStackEnabled<TOutput extends StackOutput>(stack: Stack<TOutput>) {
    if (!stack.enabled) {
        throw new Error(`Stack ${stack.name} is disabled.`);
    }
}
