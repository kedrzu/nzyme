import { assertStackEnabled } from './assertStackEnabled.js';
import { createOrSelectStack } from './createOrSelectStack.js';
import type { StackDefinition, StackOutput } from './defineStack.js';

/**
 * Refresh a stack state.
 */
export async function refreshStack<TOut extends StackOutput>(stack: StackDefinition<TOut>) {
    assertStackEnabled(stack);

    const stackInstance = await createOrSelectStack({ stack });

    await stackInstance.refresh({
        onOutput: console.log,
    });
}
