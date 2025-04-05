import { assertStackEnabled } from './assertStackEnabled.js';
import { createOrSelectStack } from './createOrSelectStack.js';
import type { StackDefinition, StackOutput } from './defineStack.js';

/**
 * Options for the {@link deployStack} function.
 */
export interface DeployStackOptions {
    /**
     * Whether to refresh the stack.
     * @default false
     */
    refresh?: boolean;
}

/**
 * Deploy a stack.
 */
export async function deployStack<TOut extends StackOutput>(
    stack: StackDefinition<TOut>,
    options: DeployStackOptions = {},
) {
    assertStackEnabled(stack);

    await stack.beforeDeploy();

    const stackInstance = await createOrSelectStack({ stack });

    const output = await stackInstance.up({
        onOutput: console.log,
        refresh: options.refresh,
    });

    await stack.afterDeploy(output.outputs);
}
