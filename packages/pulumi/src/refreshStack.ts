import { assertStackEnabled } from './assertStackEnabled.js';
import { createOrSelectStack } from './createOrSelectStack.js';
import type { Stack, StackOutput } from './defineStack.js';
import type { PulumiConfig } from './PulumiConfig.js';

/**
 * Options for the {@link refreshStack} function.
 */
export interface RefreshStackOptions {
    /**
     * The Pulumi config to use for the stack.
     */
    config: PulumiConfig;
}

/**
 * Refresh a stack state.
 */
export async function refreshStack<TOut extends StackOutput>(
    stack: Stack<TOut>,
    options: RefreshStackOptions,
) {
    assertStackEnabled(stack);

    const stackInstance = await createOrSelectStack(stack, options.config);

    await stackInstance.refresh({
        onOutput: console.log,
    });
}
