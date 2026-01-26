import { assertStackEnabled } from './assertStackEnabled.js';
import { createOrSelectStack } from './createOrSelectStack.js';
import type { Stack, StackOutput } from './defineStack.js';
import type { PulumiConfig } from './PulumiConfig.js';

/**
 * Options for the {@link cancelStack} function.
 */
export interface CancelStackOptions {
    /**
     * The Pulumi config to use for the stack.
     */
    config: PulumiConfig;
}

/**
 * Cancel a stack deployment.
 */
export async function cancelStack<TOut extends StackOutput>(stack: Stack<TOut>, options: CancelStackOptions) {
    assertStackEnabled(stack);

    const stackInstance = await createOrSelectStack(stack, options.config);
    await stackInstance.cancel();
}
