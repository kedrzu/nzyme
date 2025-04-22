import type { CommandClass } from '@nzyme/cli';
import { Command, Option, UsageError } from '@nzyme/cli';
import type { Container } from '@nzyme/ioc';

import { cancelStack } from '../cancelStack.js';
import type { StackDefinition } from '../defineStack.js';
import { deployStack } from '../deployStack.js';
import { destroyStack } from '../destroyStack.js';
import { previewStack } from '../previewStack.js';
import type { PulumiConfig } from '../PulumiConfig.js';
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

    /**
     * The Pulumi config to use for the stacks.
     */
    config: PulumiConfig;
}

/**
 * Define the Pulumi commands.
 */
// #__NO_SIDE_EFFECTS__
export function definePulumiCommands(options: PulumiCommandsOptions): CommandClass[] {
    return [
        defineDeployCommand(options),
        defineCancelCommand(options),
        definePreviewCommand(options),
        defineRefreshCommand(options),
        defineDestroyCommand(options),
    ];
}

function defineDeployCommand(options: PulumiCommandsOptions) {
    return class DeployCommand extends Command {
        static override paths = [['deploy']];
        static override usage = Command.Usage({
            category: 'Deploy',
            description: 'Deploy the application',
            details: 'Deploy the application to the selected stacks',
            examples: [
                ['Deploy all stacks', 'deploy'],
                ['Deploy single stack', 'deploy core'],
                ['Deploy multiple stacks', 'deploy core api'],
            ],
        });

        stacks = Option.Rest();

        refresh = Option.Boolean('--refresh,-r', {
            description: 'Refresh the stack state',
        });

        skipBuild = Option.Boolean('--skip-build,-s', {
            description: 'Skip the build step',
        });

        override async run() {
            const stacks = resolveStacks(this.container, options, this.stacks);
            if (stacks.length === 0) {
                throw new UsageError('No stacks to deploy.');
            }

            for (const stack of stacks) {
                await deployStack(stack, {
                    refresh: this.refresh,
                    build: !this.skipBuild,
                    config: options.config,
                });
            }
        }
    };
}

function defineCancelCommand(options: PulumiCommandsOptions) {
    return class CancelCommand extends Command {
        static override paths = [['cancel']];
        static override usage = Command.Usage({
            category: 'Cancel',
            description: 'Cancel the application',
            details: 'Cancel the application from the selected stacks',
            examples: [
                ['Cancel all stacks', 'cancel'],
                ['Cancel single stack', 'cancel core'],
                ['Cancel multiple stacks', 'cancel core api'],
            ],
        });

        stacks = Option.Rest();

        override async run() {
            const stacks = resolveStacks(this.container, options, this.stacks);
            if (stacks.length === 0) {
                throw new UsageError('No stacks to cancel.');
            }

            for (const stack of stacks) {
                await cancelStack(stack, {
                    config: options.config,
                });
            }
        }
    };
}

function definePreviewCommand(options: PulumiCommandsOptions) {
    return class PreviewCommand extends Command {
        static override paths = [['preview']];
        static override usage = Command.Usage({
            category: 'Preview',
            description: 'Preview the application',
            details: 'Preview the application from the selected stacks',
            examples: [
                ['Preview all stacks', 'preview'],
                ['Preview single stack', 'preview core'],
                ['Preview multiple stacks', 'preview core api'],
            ],
        });

        stacks = Option.Rest();

        refresh = Option.Boolean('--refresh,-r', {
            description: 'Refresh the stack state',
        });

        skipBuild = Option.Boolean('--skip-build,-s', {
            description: 'Skip the build step',
        });

        override async run() {
            const stacks = resolveStacks(this.container, options, this.stacks);
            if (stacks.length === 0) {
                throw new UsageError('No stacks to preview.');
            }

            for (const stack of stacks) {
                await previewStack(stack, {
                    refresh: this.refresh,
                    build: !this.skipBuild,
                    config: options.config,
                });
            }
        }
    };
}

function defineRefreshCommand(options: PulumiCommandsOptions) {
    return class RefreshCommand extends Command {
        static override paths = [['refresh']];
        static override usage = Command.Usage({
            category: 'Refresh',
            description: 'Refresh the application',
            details: 'Refresh the application from the selected stacks',
            examples: [
                ['Refresh all stacks', 'refresh'],
                ['Refresh single stack', 'refresh core'],
                ['Refresh multiple stacks', 'refresh core api'],
            ],
        });

        stacks = Option.Rest();

        override async run() {
            const stacks = resolveStacks(this.container, options, this.stacks);
            if (stacks.length === 0) {
                throw new UsageError('No stacks to refresh.');
            }

            for (const stack of stacks) {
                await refreshStack(stack, {
                    config: options.config,
                });
            }
        }
    };
}

function defineDestroyCommand(options: PulumiCommandsOptions) {
    return class DestroyCommand extends Command {
        static override paths = [['destroy']];
        static override usage = Command.Usage({
            category: 'Destroy',
            description: 'Destroy the application',
            details: 'Destroy the application from the selected stacks',
            examples: [
                ['Destroy all stacks', 'destroy'],
                ['Destroy single stack', 'destroy core'],
                ['Destroy multiple stacks', 'destroy core api'],
            ],
        });

        stacks = Option.Rest();

        override async run() {
            if (options.preventDeletion) {
                throw new UsageError('Stack deletion is prohibited.');
            }

            const stacks = resolveStacks(this.container, options, this.stacks);
            if (stacks.length === 0) {
                throw new UsageError('No stacks to destroy.');
            }

            for (const stack of stacks) {
                await destroyStack(stack, {
                    config: options.config,
                });
            }
        }
    };
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
