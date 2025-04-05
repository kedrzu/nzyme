import { assertStackEnabled } from './assertStackEnabled.js';
import { createOrSelectStack } from './createOrSelectStack.js';
import type { StackDefinition, StackOutput } from './defineStack.js';

/**
 * Destroy a stack.
 */
export async function destroyStack<TOut extends StackOutput>(stack: StackDefinition<TOut>) {
    assertStackEnabled(stack);

    const stackInstance = await createOrSelectStack({ stack });

    await stackInstance.destroy({
        onOutput: console.log,
    });
}
