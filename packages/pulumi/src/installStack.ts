import { automation } from '@pulumi/pulumi';

/**
 * Install dependencies for a Pulumi stack.
 */
export async function installStack(stack: automation.Stack) {
    const workspace = stack.workspace;
    if (workspace instanceof automation.LocalWorkspace) {
        await workspace.install();
    }
}
