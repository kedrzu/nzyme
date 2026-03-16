import type { Unwrap } from '@pulumi/pulumi';

import { assertStackEnabled } from './assertStackEnabled.js';
import { createOrSelectStack } from './createOrSelectStack.js';
import type { Stack, StackOutput } from './defineStack.js';
import { getStackOutputs } from './getStackOutputs.js';
import type { PulumiConfig } from './PulumiConfig.js';
import { unwrapStackOutput } from './utils/unwrapStackOutput.js';

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
     * The verbosity of the logs.
     * @default 0
     */
    verbosity?: number;

    /**
     * Whether to enable debug mode.
     * @default false
     */
    debug?: boolean;

    /**
     * Whether to skip resource deployment and only execute afterDeploy with previously deployed outputs.
     * @default false
     */
    skipResources?: boolean;

    /**
     * The Pulumi config to use for the stack.
     */
    config: PulumiConfig;
}

/**
 * Deploy a stack.
 */
export async function deployStack<TOut extends StackOutput>(stack: Stack<TOut>, options: DeployStackOptions) {
    assertStackEnabled(stack);

    await stack.build({ preview: false });

    const debug = options.debug ?? false;
    const stackInstance = await createOrSelectStack(stack, options.config);

    await stack.beforeDeploy();

    let output: Unwrap<TOut>;
    if (options.skipResources) {
        // Skip resource deployment and fetch previously deployed outputs
        output = await getStackOutputs(stack, { config: options.config });
    } else {
        const result = await stackInstance.up({
            color: 'always',
            onOutput: stack.logger.info,
            onError: stack.logger.error,
            onEvent: event => {
                if (!debug) {
                    return;
                }

                if (event.resourcePreEvent) {
                    stack.logger.debug('Resource pre event', { event: event.resourcePreEvent });

                    if (event.resourcePreEvent.metadata.op === 'update') {
                        // eslint-disable-next-line no-debugger
                        debugger;
                    }
                }
            },
            refresh: options.refresh,
            logVerbosity: options.verbosity,
            debug: options.debug,
        });

        output = unwrapStackOutput<TOut>(result.outputs);
    }

    await stack.afterDeploy(output);
}
