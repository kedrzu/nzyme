import type { Unwrap } from '@pulumi/pulumi';

import type { Semaphore } from '@nzyme/utils/createSemaphore.js';

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
     * Whether to skip resource deployment and only run the `outputs` and `afterDeploy` hooks with
     * previously deployed outputs.
     * @default false
     */
    skipResources?: boolean;

    /**
     * The Pulumi config to use for the stack.
     */
    config: PulumiConfig;

    /**
     * Serial lock for the `outputs` hook, shared by every stack of one command run — create it once per
     * run with `createSemaphore(1)`. Stacks without dependencies between them deploy concurrently, while
     * their `outputs` hooks may read-modify-write the same local file (e.g. `.env`); running the hooks
     * one at a time keeps those writes from clobbering each other.
     */
    outputsLock: Semaphore;
}

/**
 * Options for the {@link completeStackDeploy} function.
 */
export interface CompleteStackDeployOptions<TOut extends StackOutput> {
    /**
     * Deployed outputs of the stack.
     */
    output: Unwrap<TOut>;

    /**
     * @see DeployStackOptions.outputsLock
     */
    outputsLock: Semaphore;
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

    await completeStackDeploy(stack, { output, outputsLock: options.outputsLock });
}

/**
 * Tail of every deploy, whether resources were updated or skipped: the local `outputs` hook (serialized
 * across stacks) and then `afterDeploy`, both with the same outputs. `afterDeploy` runs outside the
 * lock, so stacks' remote post-deploy work stays parallel.
 */
export async function completeStackDeploy<TOut extends StackOutput>(
    stack: Stack<TOut>,
    options: CompleteStackDeployOptions<TOut>,
) {
    await options.outputsLock.run(() => stack.outputs(options.output));
    await stack.afterDeploy(options.output);
}
