import { createOrSelectStack } from './createOrSelectStack.js';
import type { Stack, StackOutput } from './defineStack.js';
import type { PulumiConfig } from './PulumiConfig.js';

/**
 * Options for retrieving Pulumi stack outputs.
 */
export interface StackOutputsOptions {
    /**
     * Pulumi configuration for stack selection and backend settings.
     */
    config: PulumiConfig;
}

/**
 * Retrieves the outputs of a Pulumi stack by creating or selecting it and reading its current outputs.
 */
export async function getStackOutputs<TOut extends StackOutput>(stack: Stack<TOut>, options: StackOutputsOptions) {
    const stackInstance = await createOrSelectStack(stack, options.config);
    return await stack.outputs(stackInstance);
}
