import { createOrSelectStack } from './createOrSelectStack.js';
import type { Stack } from './defineStack.js';
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
export async function getStackOutputs(stack: Stack, options: StackOutputsOptions) {
    const stackInstance = await createOrSelectStack(stack, options.config);
    return stackInstance.outputs();
}
