import { assertStackEnabled } from './assertStackEnabled.js';
import { createOrSelectStack } from './createOrSelectStack.js';
import type { StackDefinition, StackOutput } from './defineStack.js';

/**
 * Cancel a stack deployment.
 */
export async function cancelStack<TOut extends StackOutput>(stack: StackDefinition<TOut>) {
    assertStackEnabled(stack);

    const stackInstance = await createOrSelectStack({ stack });

    await stackInstance.cancel();
}
