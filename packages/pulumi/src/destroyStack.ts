import { assertStackEnabled } from './assertStackEnabled.js';
import { createOrSelectStack } from './createOrSelectStack.js';
import type { Stack, StackOutput } from './defineStack.js';
import type { PulumiConfig } from './PulumiConfig.js';

/**
 * Options for the {@link destroyStack} function.
 */
export interface DestroyStackOptions {
    /**
     * The Pulumi config to use for the stack.
     */
    config: PulumiConfig;
}

/**
 * Destroy a stack.
 */
export async function destroyStack<TOut extends StackOutput>(stack: Stack<TOut>, options: DestroyStackOptions) {
    assertStackEnabled(stack);

    const stackInstance = await createOrSelectStack(stack, options.config);
    const stackOutputs = await stack.outputs(stackInstance);

    await stack.beforeDestroy(stackOutputs);

    await stackInstance.destroy({
        onOutput: console.log,
    });

    await stack.afterDestroy(stackOutputs);
}
