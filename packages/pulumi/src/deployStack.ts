import { assertStackEnabled } from './assertStackEnabled.js';
import { createOrSelectStack } from './createOrSelectStack.js';
import type { Stack, StackOutput } from './defineStack.js';
import type { PulumiConfig } from './PulumiConfig.js';

/**
 * Options for the {@link deployStack} function.
 */
export interface DeployStackOptions {
    /**
     * Whether to refresh the stack.
     * @default false
     */
    refresh?: boolean;

    /**
     * Whether to build the stack before deploying.
     * @default true
     */
    build?: boolean;

    /**
     * The Pulumi config to use for the stack.
     */
    config: PulumiConfig;
}

/**
 * Deploy a stack.
 */
export async function deployStack<TOut extends StackOutput>(
    stack: Stack<TOut>,
    options: DeployStackOptions,
) {
    assertStackEnabled(stack);

    if (options.build !== false) {
        await stack.build({ preview: false });
    }

    const stackInstance = await createOrSelectStack(stack, options.config);

    const output = await stackInstance.up({
        onOutput: console.log,
        refresh: options.refresh,
    });

    await stack.afterDeploy(output.outputs);
}
