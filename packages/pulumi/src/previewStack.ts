import { assertStackEnabled } from './assertStackEnabled.js';
import { createOrSelectStack } from './createOrSelectStack.js';
import type { Stack, StackOutput } from './defineStack.js';
import type { PulumiConfig } from './PulumiConfig.js';

/**
 * Options for the {@link previewStack} function.
 */
export interface PreviewStackOptions {
    /**
     * Whether to refresh the stack.
     * @default false
     */
    refresh?: boolean;

    /**
     * Whether to print each resource's property changes instead of the one-line summary per resource.
     * @default false
     */
    diff?: boolean;

    /**
     * The verbosity of the logs.
     * @default 0
     */
    verbosity?: number;

    /**
     * The Pulumi config to use for the stack.
     */
    config: PulumiConfig;
}

/**
 * Preview a stack.
 */
export async function previewStack<TOut extends StackOutput>(stack: Stack<TOut>, options: PreviewStackOptions) {
    assertStackEnabled(stack);

    await stack.build({ preview: true });

    const stackInstance = await createOrSelectStack(stack, options.config);

    const output = await stackInstance.preview({
        onOutput: console.log,
        refresh: options.refresh,
        diff: options.diff,
        logVerbosity: options.verbosity,
    });

    return output;
}
