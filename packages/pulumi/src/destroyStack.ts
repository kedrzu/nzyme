import { assertStackEnabled } from './assertStackEnabled.js';
import { createOrSelectStack } from './createOrSelectStack.js';
import type { Stack, StackOutput } from './defineStack.js';

/**
 * Destroy a stack.
 */
export async function destroyStack<TOut extends StackOutput>(stack: Stack<TOut>) {
    assertStackEnabled(stack);

    const stackInstance = await createOrSelectStack({ stack });

    await stackInstance.destroy({
        onOutput: console.log,
    });
}
