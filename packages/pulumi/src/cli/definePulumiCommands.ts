import chalk from 'chalk';

import type { CommandClass } from '@nzyme/cli';
import { Command, Option, UsageError } from '@nzyme/cli';
import { getAllDeps, isDependentOn, sortByDependency } from '@nzyme/ioc';

import { cancelStack } from '../cancelStack.js';
import { defineStack, isStackDefinition } from '../defineStack.js';
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
    config: (() => Promise<PulumiConfig>) | (() => PulumiConfig) | PulumiConfig;

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

            const pulumiConfig = await getPulumiConfig(options);
            const stacksLeft = new Set<StackDefinition>(stacks);
            const stacksDeploying = new Map<StackDefinition, Promise<void>>();
            const stacksDeployed = new Set<StackDefinition>();
            const stacksFailed = new Map<StackDefinition, unknown>();

            const deployNext = () => {
                if (stacksFailed.size > 0) {
                    return false;
                }

                for (const stack of stacksLeft) {
                    // Skip if already deployed
                    if (stacksDeployed.has(stack) || stacksDeploying.has(stack)) {
                        continue;
                    }

                    // Check if all dependencies are deployed
                    const awaitDeps = stacks.some(s => isDependentOn(stack, s) && !stacksDeployed.has(s));
                    if (awaitDeps) {
                        continue;
                    }

                    const stackResolved = this.container.resolve(stack);
                    const stackName = chalk.bold(chalk.green(stack.stackName));

                    stackResolved.logger.info(`🚀 Deploying stack ${stackName}...`);

                    const stackPromise = deployStack(stackResolved, {
                        refresh: this.refresh,
                        build: !this.skipBuild,
                        config: pulumiConfig,
                    })
                        .then(() => {
                            stacksDeploying.delete(stack);
                            stacksDeployed.add(stack);
                            stacksLeft.delete(stack);
                            stackResolved.logger.info(`🎉 Deployed stack ${stackName}`);
                        })
                        .catch(e => {
                            stacksDeploying.delete(stack);
                            stacksFailed.set(stack, e);
                            stackResolved.logger.error(`❌ Failed to deploy stack ${stackName}.`, {
                                error: e,
                            });
                        });

                    stacksDeploying.set(stack, stackPromise);
                    return true;
                }

                return false;
            };

            while (stacksLeft.size > 0) {
                if (stacksFailed.size > 0) {
                    break;
                }

                // Try to deploy more stacks
                while (deployNext()) {
                    // Deploy as many stacks as possible
                }

                await Promise.any(stacksDeploying.values());
            }

            await Promise.allSettled(stacksDeploying.values());

            if (stacksFailed.size > 0) {
                throw new UsageError(
                    `Failed to deploy stacks: ${[...stacksLeft.keys()].map(s => s.stackName).join(', ')}`,
                );
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

            const pulumiConfig = await getPulumiConfig(options);

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
                    config: pulumiConfig,
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

            const pulumiConfig = await getPulumiConfig(options);

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
                    config: pulumiConfig,
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

            const pulumiConfig = await getPulumiConfig(options);

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
                    config: pulumiConfig,
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

        force = Option.Boolean('--force,-f', {
            description: 'Destroy the stack even if it is protected or orphaned',
        });

        stacks = Option.Rest();

        override async run() {
            await options.beforeEach?.();

            if (options.preventDestroy) {
                throw new UsageError('Stack deletion is prohibited.');
            }

            const pulumiConfig = await getPulumiConfig(options);

            if (this.force) {
                if (!this.stacks.length) {
                    throw new UsageError('When using --force, you must specify stacks to destroy.');
                }

                for (const stack of this.stacks) {
                    const stackDefinition = defineStack({
                        name: stack,
                        resources() {
                            return {};
                        },
                    });

                    const stackResolved = stackDefinition.create();
                    await destroyStack(stackResolved, {
                        config: pulumiConfig,
                        refresh: this.refresh,
                        remove: this.remove,
                    });
                }

                return;
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
                    config: pulumiConfig,
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

            const pulumiConfig = await getPulumiConfig(options);

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
                    config: pulumiConfig,
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

async function getPulumiConfig(options: PulumiCommandsOptions): Promise<PulumiConfig> {
    if (typeof options.config === 'function') {
        return await options.config();
    }

    return options.config;
}
