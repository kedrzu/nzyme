import { automation } from '@pulumi/pulumi';

import type { Stack, StackOutput } from './defineStack.js';
import type { PulumiConfig } from './PulumiConfig.js';
import { buildStackWorkspace } from './utils/buildStackWorkspace.js';

/**
 * Selects an existing stack, or returns `null` when the backend has no such stack. Unlike
 * `createOrSelectStack` it never creates one, so read-only commands (e.g. `output`) leave no empty
 * stack behind for a stack that was never deployed.
 */
export async function selectStack<TOutput extends StackOutput>(stack: Stack<TOutput>, config: PulumiConfig) {
    const workspace = await buildStackWorkspace(stack, config);

    try {
        return await automation.LocalWorkspace.selectStack(workspace.args, workspace.options);
    } catch (error) {
        if (error instanceof automation.StackNotFoundError) {
            return null;
        }

        throw error;
    }
}
