import { automation } from '@pulumi/pulumi';

import type { Stack, StackOutput } from './defineStack.js';
import type { PulumiConfig } from './PulumiConfig.js';
import { buildStackWorkspace } from './utils/buildStackWorkspace.js';

/**
 * Creates or selects a stack.
 */
export async function createOrSelectStack<TOutput extends StackOutput>(stack: Stack<TOutput>, config: PulumiConfig) {
    const workspace = await buildStackWorkspace(stack, config);
    return await automation.LocalWorkspace.createOrSelectStack(workspace.args, workspace.options);
}
