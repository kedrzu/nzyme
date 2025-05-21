import chalk from 'chalk';

import type { CommandClass } from '@nzyme/cli';
import { Command, Option, UsageError } from '@nzyme/cli';
import { getAllDeps, isDependentOn, sortByDependency } from '@nzyme/ioc';
import { arrayRemoveWhere } from '@nzyme/utils';

import { cancelStack } from '../cancelStack.js';
import { isStackDefinition } from '../defineStack.js';
import type { StackDefinition } from '../defineStack.js';
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
     * Whether to prevent the stacks from being destroyed.
     */
    preventDestroy?: boolean;

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

interface ResolveStacksOptions extends PulumiCommandsOptions {
    stackNames: string[];
    recursive?: boolean;
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
                const stackResolved = this.container.resolve(stack);
                const disabled = !stackResolved.enabled ? chalk.red('[disabled]') : '';

                // Increment counter and format with right padding to align stack names
                const number = chalk.gray(`${++i}.`.padStart(padding));

                console.log(`${number}${stackResolved.name} ${disabled}`);
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

        recursive = Option.Boolean('--recursive,-R', {
            description: 'Deploy all stacks that depend on the selected stacks',
        });

        skipBuild = Option.Boolean('--skip-build,-s', {
            description: 'Skip the build step',
        });

        override async run() {
            await options.beforeEach?.();

            const stacks = resolveStacks({
                ...options,
                stackNames: this.stacks,
                recursive: this.recursive,
            });

            if (stacks.length === 0) {
                throw new UsageError('No stacks to deploy.');
            }

            const deployed = new Set<StackDefinition>();
            const current: { promise: Promise<void>; stack: StackDefinition }[] = [];

            const deployNext = () => {
                for (let i = 0; i < stacks.length; i++) {
                    const stack = stacks[i]!;
                    // Skip if already deployed
                    if (deployed.has(stack) || current.some(s => s.stack === stack)) {
                        continue;
                    }

                    // Check if all dependencies are deployed
                    const awaitDeps = stacks.some(s => isDependentOn(stack, s) && !deployed.has(s));
                    if (awaitDeps) {
                        continue;
                    }

                    const stackResolved = this.container.resolve(stack);

                    const stackPromise = deployStack(stackResolved, {
                        refresh: this.refresh,
                        build: !this.skipBuild,
                        config: options.config,
                    }).then(() => {
                        arrayRemoveWhere(current, s => s.stack === stack);
                        deployed.add(stack);
                        void deployNext();
                    });

                    current.push({ promise: stackPromise, stack });
                    return true;
                }

                return false;
            };

            // Start deploying stacks
            while (deployNext()) {
                // Deploy as many initial stacks as possible
            }

            // Wait for all stacks to complete
            while (current.length > 0) {
                await Promise.all(current.map(c => c.promise));

                // Try to deploy more stacks
                while (deployNext()) {
                    // Deploy as many stacks as possible
                }
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

            const stacks = resolveStacks({
                ...options,
                stackNames: this.stacks,
            });

            if (stacks.length === 0) {
                throw new UsageError('No stacks to cancel.');
            }

            for (const stack of stacks) {
                const stackResolved = this.container.resolve(stack);
                console.log(`Cancelling stack ${chalk.green(stack.name)}...`);
                await cancelStack(stackResolved, {
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

            const stacks = resolveStacks({
                ...options,
                stackNames: this.stacks,
            });

            if (stacks.length === 0) {
                throw new UsageError('No stacks to preview.');
            }

            for (const stack of stacks) {
                const stackResolved = this.container.resolve(stack);
                await previewStack(stackResolved, {
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

            const stacks = resolveStacks({
                ...options,
                stackNames: this.stacks,
            });

            if (stacks.length === 0) {
                throw new UsageError('No stacks to refresh.');
            }

            for (const stack of stacks) {
                const stackResolved = this.container.resolve(stack);
                await refreshStack(stackResolved, {
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

            if (options.preventDestroy) {
                throw new UsageError('Stack deletion is prohibited.');
            }

            const stacks = resolveStacks({
                ...options,
                stackNames: this.stacks,
            });

            if (stacks.length === 0) {
                throw new UsageError('No stacks to destroy.');
            }

            for (const stack of [...stacks].reverse()) {
                const stackResolved = this.container.resolve(stack);
                if (stackResolved.preventDestroy) {
                    console.warn(`Stack ${chalk.yellow(stack.name)} is protected and cannot be destroyed.`);
                    continue;
                }

                await destroyStack(stackResolved, {
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

            const stacks = resolveStacks({
                ...options,
                stackNames: this.stacks,
            });

            if (stacks.length === 0) {
                throw new UsageError('No stacks to output.');
            }

            for (const stack of stacks) {
                const stackResolved = this.container.resolve(stack);
                const outputs = await getStackOutputs(stackResolved, {
                    config: options.config,
                });

                console.log(`Outputs for stack ${chalk.green(stack.name)}:`);
                console.log(chalk.gray(JSON.stringify(outputs, null, 2)));
            }
        }
    };
}

function resolveStacks(options: ResolveStacksOptions) {
    const stacksSet = filterStacks(options);

    if (options.recursive) {
        for (const stack of [...stacksSet]) {
            const deps = getAllDeps(stack);
            for (const dep of deps) {
                if (isStackDefinition(dep)) {
                    stacksSet.add(dep);
                }
            }
        }
    }

    return sortByDependency([...stacksSet]);
}

function filterStacks(options: ResolveStacksOptions): Set<StackDefinition> {
    if (options.stackNames.length === 0) {
        return new Set(options.stacks.filter(s => s.enabled));
    }

    const stacks: Set<StackDefinition> = new Set();
    const stackNamesSet = new Set(options.stackNames);
    for (const stack of options.stacks) {
        if (stackNamesSet.has(stack.stackName)) {
            stacks.add(stack);
            stackNamesSet.delete(stack.stackName);

            if (!stack.enabled) {
                throw new UsageError(`Stack ${stack.stackName} is disabled.`);
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
