import chalk from 'chalk';

import type { Stack } from './defineStack.js';

/**
 * Options for the {@link printStackOutputs} function.
 */
export interface PrintStackOutputsOptions {
    /**
     * Stacks to print the outputs of.
     */
    stacks: Stack[];

    /**
     * Fetches a stack's currently deployed outputs, or `null` when the backend has no such stack. Must
     * never create a stack.
     */
    fetchOutputs: (stack: Stack) => Promise<Record<string, unknown> | null>;
}

/**
 * Prints the currently deployed outputs of the given stacks (`output --print`) — fetch and print only,
 * nothing else. Unlike `syncStackOutputs`, this must NEVER run a stack's `outputs`, `afterDeploy` or
 * `build` hook: it exists so a caller can inspect outputs (including secrets) without also materializing
 * local config as a side effect.
 *
 * A stack the backend has no record of (never deployed) is skipped with a warning instead of failing the
 * whole run.
 */
export async function printStackOutputs(options: PrintStackOutputsOptions): Promise<void> {
    for (const stack of options.stacks) {
        const outputs = await options.fetchOutputs(stack);
        if (!outputs) {
            stack.logger.warn(`⚠️  Stack ${chalk.yellow(stack.name)} is not deployed, skipping.`);
            continue;
        }

        console.log(`Outputs for stack ${chalk.green(stack.name)}:`);
        console.log(chalk.gray(JSON.stringify(outputs, null, 2)));
    }
}
