import type * as pulumi from '@pulumi/pulumi';
import type { OutputMap } from '@pulumi/pulumi/automation/stack.js';

import type { StackOutput } from '../defineStack.js';

/**
 * Unwrap a stack output.
 */
export function unwrapStackOutput<TOutput extends StackOutput>(output: OutputMap) {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(output)) {
        result[key] = value.value;
    }

    return result as pulumi.Unwrap<TOutput>;
}
