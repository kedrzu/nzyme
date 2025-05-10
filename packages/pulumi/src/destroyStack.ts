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

    /**
     * Remove the stack and its configuration after all resources in the stack have been deleted.
     */
    remove?: boolean;

    /**
     * Refresh the state of the stack's resources against the cloud provider before running destroy.
     */
    refresh?: boolean;
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
        remove: options.remove,
        refresh: options.refresh,
    });

    await stack.afterDestroy(stackOutputs);
}
