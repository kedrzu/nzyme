import chalk from 'chalk';

import type { CommandClass } from '@nzyme/cli';
import { Command, Option, UsageError } from '@nzyme/cli';
import type { Container } from '@nzyme/ioc';

import { cancelStack } from '../cancelStack.js';
import type { Stack, StackDefinition } from '../defineStack.js';
import { deployStack } from '../deployStack.js';
import { destroyStack } from '../destroyStack.js';
import { getStackOutputs } from '../getStackOutputs.js';
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

    /**
     * The prefix to use for commands.
     */
    prefix?: string;

    /**
     * The function to call before each command.
     */
    beforeEach?: () => Promise<void>;
}

/**
 * Define the Pulumi commands.
 * @__NO_SIDE_EFFECTS__
 */
export function definePulumiCommands(options: PulumiCommandsOptions): CommandClass[] {
    return [
        defineListCommand(options),
        defineDeployCommand(options),
        defineCancelCommand(options),
        definePreviewCommand(options),
        defineRefreshCommand(options),
        defineDestroyCommand(options),
        defineOutputCommand(options),
    ];
}

function defineListCommand(options: PulumiCommandsOptions) {
    return class ListCommand extends Command {
        static override paths = getCommandPaths(options, 'list');
        static override usage = Command.Usage({
            category: 'Pulumi',
            description: 'List stacks',
            details: 'List all stacks',
        });

        override async run() {
            await options.beforeEach?.();

            console.log(chalk.bold('All available stacks:'));
            let i = 0;
            const padding = options.stacks.length.toString().length + 1;

            for (const stack of options.stacks) {
                const resolvedStack = this.container.resolve(stack);
                const disabled = !resolvedStack.enabled ? chalk.red('[disabled]') : '';

                // Increment counter and format with right padding to align stack names
                const number = chalk.gray(`${++i}.`.padStart(padding));

                console.log(`${number}${resolvedStack.name} ${disabled}`);
            }
        }
    };
}

function defineDeployCommand(options: PulumiCommandsOptions) {
    return class DeployCommand extends Command {
        static override paths = getCommandPaths(options, 'deploy');
        static override usage = Command.Usage({
            category: 'Pulumi',
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
            description: 'Refresh the stack state before deploy',
        });

        skipBuild = Option.Boolean('--skip-build,-s', {
            description: 'Skip the build step',
        });

        override async run() {
            await options.beforeEach?.();

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
        static override paths = getCommandPaths(options, 'cancel');
        static override usage = Command.Usage({
            category: 'Pulumi',
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
            await options.beforeEach?.();

            const stacks = resolveStacks(this.container, options, this.stacks);
            if (stacks.length === 0) {
                throw new UsageError('No stacks to cancel.');
            }

            for (const stack of stacks) {
                console.log(`Cancelling stack ${chalk.green(stack.name)}...`);
                await cancelStack(stack, {
                    config: options.config,
                });
            }
        }
    };
}

function definePreviewCommand(options: PulumiCommandsOptions) {
    return class PreviewCommand extends Command {
        static override paths = getCommandPaths(options, 'preview');
        static override usage = Command.Usage({
            category: 'Pulumi',
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
            description: 'Refresh the stack state before previewing',
        });

        skipBuild = Option.Boolean('--skip-build,-s', {
            description: 'Skip the build step',
        });

        override async run() {
            await options.beforeEach?.();

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
        static override paths = getCommandPaths(options, 'refresh');
        static override usage = Command.Usage({
            category: 'Pulumi',
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
            await options.beforeEach?.();

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
        static override paths = getCommandPaths(options, 'destroy');
        static override usage = Command.Usage({
            category: 'Pulumi',
            description: 'Destroy the application',
            details: 'Destroy the selected stacks',
            examples: [
                ['Destroy all stacks', 'destroy'],
                ['Destroy single stack', 'destroy core'],
                ['Destroy multiple stacks', 'destroy core api'],
            ],
        });

        refresh = Option.Boolean('--refresh,-r', {
            description: 'Refresh the stack state before destroying',
        });

        remove = Option.Boolean('--remove,-rm', {
            description: 'Remove the stack and its configuration after destroying',
        });

        stacks = Option.Rest();

        override async run() {
            await options.beforeEach?.();

            if (options.preventDeletion) {
                throw new UsageError('Stack deletion is prohibited.');
            }

            const stacks = resolveStacks(this.container, options, this.stacks);
            if (stacks.length === 0) {
                throw new UsageError('No stacks to destroy.');
            }

            for (const stack of [...stacks].reverse()) {
                await destroyStack(stack, {
                    config: options.config,
                    refresh: this.refresh,
                    remove: this.remove,
                });
            }
        }
    };
}

function defineOutputCommand(options: PulumiCommandsOptions) {
    return class OutputCommand extends Command {
        static override paths = getCommandPaths(options, 'output');
        static override usage = Command.Usage({
            category: 'Pulumi',
            description: 'Print the output of the selected stacks',
        });

        stacks = Option.Rest();

        override async run() {
            await options.beforeEach?.();

            const stacks = resolveStacks(this.container, options, this.stacks);
            if (stacks.length === 0) {
                throw new UsageError('No stacks to output.');
            }

            for (const stack of stacks) {
                const outputs = await getStackOutputs(stack, {
                    config: options.config,
                });

                console.log(`Outputs for stack ${chalk.green(stack.name)}:`);
                console.log(chalk.gray(JSON.stringify(outputs, null, 2)));
            }
        }
    };
}

function resolveStacks(container: Container, options: PulumiCommandsOptions, stackNames: string[]) {
    const allStack = options.stacks.map(s => container.resolve(s));

    if (stackNames.length === 0) {
        return allStack.filter(s => s.enabled);
    }

    const stackNamesSet = new Set(stackNames);
    const stacks: Stack[] = [];

    for (const stack of allStack) {
        if (stackNamesSet.has(stack.name)) {
            stacks.push(stack);
            stackNamesSet.delete(stack.name);

            if (!stack.enabled) {
                throw new UsageError(`Stack ${stack.name} is disabled.`);
            }
        }
    }

    if (stackNamesSet.size > 0) {
        throw new UsageError(`Stack(s) ${Array.from(stackNamesSet).join(', ')} do not exist.`);
    }

    return stacks;
}

function getCommandPaths(options: PulumiCommandsOptions, command: string) {
    if (options.prefix) {
        return [[options.prefix, command]];
    }

    return [[command]];
}
