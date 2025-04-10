import { Option, UsageError } from 'clipanion';

import { defineCommand } from '@nzyme/cli';
import { Container } from '@nzyme/ioc';

import { cancelStack } from '../cancelStack.js';
import type { StackDefinition } from '../defineStack.js';
import { deployStack } from '../deployStack.js';
import { destroyStack } from '../destroyStack.js';
import { previewStack } from '../previewStack.js';
import { refreshStack } from '../refreshStack.js';

/**
 * Options for the Pulumi commands.
 */
export interface PulumiCommandsOptions {
    /**
     * The stacks to deploy.
     */
    stacks: StackDefinition[];

    /**
     * Whether to prevent deletion of the stacks.
     */
    preventDeletion?: boolean;
}

/**
 * Define the Pulumi commands.
 */
export function definePulumiCommands(options: PulumiCommandsOptions) {
    return [
        defineDeployCommand(options),
        defineCancelCommand(options),
        definePreviewCommand(options),
        defineRefreshCommand(options),
        defineDeleteCommand(options),
    ];
}

function defineDeployCommand(options: PulumiCommandsOptions) {
    return defineCommand({
        path: 'deploy',
        description: 'Deploy the application',
        details: 'Deploy the application to the selected stacks',
        examples: [
            ['Deploy all stacks', 'deploy'],
            ['Deploy single stack', 'deploy core'],
            ['Deploy multiple stacks', 'deploy core api'],
        ],
        args: {
            stacks: Option.Rest(),
            refresh: Option.Boolean('--refresh,-r', {
                description: 'Refresh the stack state',
            }),
            skipBuild: Option.Boolean('--skip-build,-s', {
                description: 'Skip the build step',
            }),
        },
        deps: {
            container: Container,
        },
        execute: async ({ args, deps }) => {
            for (const stack of resolveStacks(deps.container, options, args.stacks)) {
                await deployStack(stack, {
                    refresh: args.refresh,
                    build: !args.skipBuild,
                });
            }
        },
    });
}

function defineCancelCommand(options: PulumiCommandsOptions) {
    return defineCommand({
        path: 'cancel',
        description: 'Cancel the application',
        details: 'Cancel the application from the selected stacks',
        examples: [
            ['Cancel all stacks', 'cancel'],
            ['Cancel single stack', 'cancel core'],
            ['Cancel multiple stacks', 'cancel core api'],
        ],
        args: {
            stacks: Option.Rest(),
        },
        deps: {
            container: Container,
        },
        execute: async ({ args, deps }) => {
            for (const stack of resolveStacks(deps.container, options, args.stacks)) {
                await cancelStack(stack);
            }
        },
    });
}

function definePreviewCommand(options: PulumiCommandsOptions) {
    return defineCommand({
        path: 'preview',
        description: 'Preview the application',
        details: 'Preview the application from the selected stacks',
        examples: [
            ['Preview all stacks', 'preview'],
            ['Preview single stack', 'preview core'],
            ['Preview multiple stacks', 'preview core api'],
        ],
        args: {
            stacks: Option.Rest(),
            refresh: Option.Boolean('--refresh,-r', {
                description: 'Refresh the stack state',
            }),
            skipBuild: Option.Boolean('--skip-build,-s', {
                description: 'Skip the build step',
            }),
        },
        deps: {
            container: Container,
        },
        execute: async ({ args, deps }) => {
            for (const stack of resolveStacks(deps.container, options, args.stacks)) {
                await previewStack(stack, {
                    refresh: args.refresh,
                    build: !args.skipBuild,
                });
            }
        },
    });
}

function defineRefreshCommand(options: PulumiCommandsOptions) {
    return defineCommand({
        path: 'refresh',
        description: 'Refresh the application',
        details: 'Refresh the application from the selected stacks',
        examples: [
            ['Refresh all stacks', 'refresh'],
            ['Refresh single stack', 'refresh core'],
            ['Refresh multiple stacks', 'refresh core api'],
        ],
        args: {
            stacks: Option.Rest(),
        },
        deps: {
            container: Container,
        },
        execute: async ({ args, deps }) => {
            for (const stack of resolveStacks(deps.container, options, args.stacks)) {
                await refreshStack(stack);
            }
        },
    });
}

function defineDeleteCommand(options: PulumiCommandsOptions) {
    return defineCommand({
        path: 'destroy',
        description: 'Destroy the application',
        details: 'Destroy the application from the selected stacks',
        examples: [
            ['Destroy all stacks', 'destroy'],
            ['Destroy single stack', 'destroy core'],
            ['Destroy multiple stacks', 'destroy core api'],
        ],
        args: {
            stacks: Option.Rest(),
        },
        deps: {
            container: Container,
        },
        execute: async ({ args, deps }) => {
            if (options.preventDeletion) {
                throw new UsageError('Stack deletion is prohibited.');
            }

            for (const stack of resolveStacks(deps.container, options, args.stacks)) {
                await destroyStack(stack);
            }
        },
    });
}

function resolveStacks(container: Container, options: PulumiCommandsOptions, stackNames: string[]) {
    const allStackDefs = options.stacks.map(s => container.resolve(s)).filter(s => s.enabled);

    if (stackNames.length === 0) {
        return allStackDefs;
    }

    return stackNames.map(stackName => {
        const stackDef = allStackDefs.find(s => s.name === stackName);
        if (!stackDef) {
            throw new UsageError(`Stack ${stackName} does not exist.`);
        }

        return stackDef;
    });
}
