import { createOrSelectStack } from './createOrSelectStack.js';
import type { Stack, StackOutput } from './defineStack.js';
import type { PulumiConfig } from './PulumiConfig.js';

/**
 *
 */
export interface StackOutputsOptions {
    /**
     *
     */
    config: PulumiConfig;
}

/**
 *
 */
export async function getStackOutputs<TOut extends StackOutput>(stack: Stack<TOut>, options: StackOutputsOptions) {
    const stackInstance = await createOrSelectStack(stack, options.config);
    return await stack.outputs(stackInstance);
}
