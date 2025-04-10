import { assertStackEnabled } from './assertStackEnabled.js';
import { createOrSelectStack } from './createOrSelectStack.js';
import type { Stack, StackOutput } from './defineStack.js';

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
     * Whether to build the stack before previewing.
     * @default true
     */
    build?: boolean;
}

/**
 * Preview a stack.
 */
export async function previewStack<TOut extends StackOutput>(
    stack: Stack<TOut>,
    options: PreviewStackOptions = {},
) {
    assertStackEnabled(stack);

    if (options.build !== false) {
        await stack.build({ preview: true });
    }

    const stackInstance = await createOrSelectStack({ stack });

    const output = await stackInstance.preview({
        onOutput: console.log,
        refresh: options.refresh,
    });

    return output;
}
