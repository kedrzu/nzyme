import chalk from 'chalk';
import Table from 'cli-table3';

import type { CommandClass } from '@nzyme/cli';
import { Command, Option, UsageError } from '@nzyme/cli';
import { getAllDeps, isDependentOn, sortByDependency } from '@nzyme/ioc';
import { forEachParalell } from '@nzyme/utils';

import { cancelStack } from '../cancelStack.js';
import { createOrSelectStack } from '../createOrSelectStack.js';
import { defineStack, isStackDefinition } from '../defineStack.js';
import type { StackDefinition } from '../defineStack.js';
import { deployStack } from '../deployStack.js';
import { destroyStack } from '../destroyStack.js';
import { getStackOutputs } from '../getStackOutputs.js';
import { installStack } from '../installStack.js';
import { previewStack } from '../previewStack.js';
import type { PulumiConfig } from '../PulumiConfig.js';
import { refreshStack } from '../refreshStack.js';
import { listRemoteStacks } from '../utils/listRemoteStacks.js';

/**
 * Context for the Pulumi commands.
 */
export interface PulumiContext {
    /**
     * Command instance.
     */
    command: Command;
}

/**
 * Context for the Pulumi stack commands.
 */
export interface PulumiStackContext extends PulumiContext {
    /**
     * Stack to process.
     */
    stack: StackDefinition;
}

/**
 * Context for the Pulumi before deploy command.
 */
export interface PulumiBeforeDeployContext extends PulumiContext {
    /**
     * Stacks to deploy.
     */
    stacks: StackDefinition[];
}

/**
 * Context for the Pulumi after deploy command.
 */
export interface PulumiAfterDeployContext extends PulumiContext {
    /**
     * Stacks that were deployed successfully.
     */
    stacksDeployed: StackDefinition[];
    /**
     * Stacks that failed to deploy.
     */
    stacksFailed: StackDefinition[];
}

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
    beforeEach?: (ctx: PulumiContext) => Promise<void>;

    /**
     * The function to call after each command.
     */
    afterEach?: (ctx: PulumiContext) => Promise<void>;

    /**
     * The function to call before deploying the application.
     */
    beforeDeploy?: (ctx: PulumiBeforeDeployContext) => Promise<void>;

    /**
     * The function to call after deploying the application.
     */
    afterDeploy?: (ctx: PulumiAfterDeployContext) => Promise<void>;

    /**
     * The function to call before deploying a stack.
     */
    beforeDeployStack?: (ctx: PulumiStackContext) => Promise<void>;

    /**
     * The function to call after deploying a stack.
     */
    afterDeployStack?: (ctx: PulumiStackContext) => Promise<void>;

    /**
     * The function to call before destroying a stack.
     */
    beforeDestroyStack?: (ctx: PulumiStackContext) => Promise<void>;

    /**
     * The function to call after destroying a stack.
     */
    afterDestroyStack?: (ctx: PulumiStackContext) => Promise<void>;
}

interface ResolveStacksOptions extends PulumiCommandsOptions {
    stackNames: string[];
    recursive?: boolean;
    skip?: string[];
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
        defineInstallCommand(options),
    ];
}

function defineListCommand(options: PulumiCommandsOptions) {
    return class ListCommand extends Command {
        static override paths = getCommandPaths(options, 'list');
        static override usage = Command.Usage({
            category: 'Pulumi',
            description: 'List stacks',
            details: 'List all stacks, including orphaned stacks from remote backend with deployment information',
        });

        override async run() {
            await options.beforeEach?.({ command: this });

            const pulumiConfig = await getPulumiConfig(options);

            // Get local stack names
            const localStackNames = new Set(options.stacks.map(stack => stack.stackName));

            // Get detailed remote stacks from S3 backend
            const remoteStacksDetailed = await listRemoteStacks(pulumiConfig);
            const orphanedStacksDetailed = remoteStacksDetailed.filter(stack => !localStackNames.has(stack.name));

            console.log();
            console.log(chalk.bold('All available stacks with deployment information:'));
            console.log();

            // Create table for local stacks
            const localTable = new Table({
                head: [
                    chalk.bold('Stack Name'),
                    chalk.bold('Status'),
                    chalk.bold('Last Deployment'),
                    chalk.bold('Resources'),
                    chalk.bold('Last Update'),
                ],
                style: {
                    head: [],
                    border: [],
                },
            });

            // Add local stacks to table
            for (const stack of options.stacks) {
                const stackResolved = this.container.resolve(stack);
                const remoteInfo = remoteStacksDetailed.find(remote => remote.name === stack.stackName);

                let stackName = stackResolved.name;
                if (!stackResolved.enabled) {
                    stackName += ` ${chalk.red('[disabled]')}`;
                }

                let status = chalk.yellow('Not deployed');
                let lastDeployment = chalk.gray('—');
                let resourceCount = chalk.gray('—');
                let lastUpdate = chalk.gray('—');

                if (remoteInfo) {
                    status = remoteInfo.isDestroyed ? chalk.red('Destroyed') : chalk.green('Active');
                    lastDeployment = remoteInfo.lastDeployment
                        ? remoteInfo.lastDeployment.toLocaleString()
                        : chalk.gray('Unknown');
                    resourceCount = remoteInfo.resourceCount?.toString() ?? chalk.gray('Unknown');
                    lastUpdate = `${remoteInfo.lastUpdateKind} (${remoteInfo.lastUpdateResult})`;
                }

                localTable.push([stackName, status, lastDeployment, resourceCount, lastUpdate]);
            }

            console.log(localTable.toString());

            // List orphaned stacks with detailed info
            if (orphanedStacksDetailed.length > 0) {
                console.log();
                console.log(chalk.bold.magenta('Orphaned stacks:'));
                console.log();

                const orphanedTable = new Table({
                    head: [
                        chalk.bold('Stack Name'),
                        chalk.bold('Status'),
                        chalk.bold('Last Deployment'),
                        chalk.bold('Resources'),
                        chalk.bold('Last Update'),
                    ],
                    style: {
                        head: [],
                        border: [],
                    },
                });

                for (const stack of orphanedStacksDetailed) {
                    const status = stack.isDestroyed ? chalk.red('Destroyed') : chalk.green('Active');
                    const lastDeployment = stack.lastDeployment
                        ? stack.lastDeployment.toLocaleString()
                        : chalk.gray('Unknown');
                    const resourceCount = stack.resourceCount?.toString() ?? chalk.gray('Unknown');
                    const lastUpdate = `${stack.lastUpdateKind} (${stack.lastUpdateResult})`;

                    orphanedTable.push([
                        `${stack.name} ${chalk.magenta('[orphaned]')}`,
                        status,
                        lastDeployment,
                        resourceCount,
                        lastUpdate,
                    ]);
                }

                console.log(orphanedTable.toString());
                console.log();
                console.log(
                    chalk.yellow(
                        `Found ${orphanedStacksDetailed.length} orphaned stack(s) in remote backend that are not defined locally.`,
                    ),
                );
                console.log(
                    chalk.gray('Orphaned stacks can be destroyed using: ') +
                        chalk.cyan('stack destroy --force <stack-name>'),
                );
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
                ['Cancel previous and deploy', 'deploy --cancel core'],
            ],
        });

        stacks = Option.Rest();

        refresh = Option.Boolean('--refresh,-r', {
            description: 'Refresh the stack state before deploy',
        });

        recursive = Option.Boolean('--recursive,-R', {
            description: 'Deploy all stacks that depend on the selected stacks',
        });

        verbosity = Option.Counter('--verbose,-v', {
            description: 'The verbosity of the logs',
        });

        debug = Option.Boolean('--debug,-d', {
            description: 'Enable debug mode',
        });

        skip = Option.Array('--skip,-s', [], {
            description: 'Skip specific stacks from being deployed (can be used multiple times)',
        });

        skipBuild = Option.Boolean('--skip-build,-sb', {
            description: 'Skip the build step',
        });

        skipResources = Option.Boolean('--skip-resources,-sr', {
            description: 'Skip resource deployment and only execute afterDeploy with previously deployed outputs',
        });

        cancel = Option.Boolean('--cancel,-c', {
            description: 'Cancel previous deployment before deploying each stack',
        });

        override async run() {
            await options.beforeEach?.({ command: this });

            const stacks = resolveStacks({
                ...options,
                stackNames: this.stacks,
                recursive: this.recursive,
                skip: this.skip,
            });

            if (stacks.length === 0) {
                throw new UsageError('No stacks to deploy.');
            }

            await options.beforeDeploy?.({ command: this, stacks });

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

                    const stackPromise = (async () => {
                        if (this.cancel) {
                            stackResolved.logger.info(`🚫 Cancelling previous deployment for stack ${stackName}...`);
                            await cancelStack(stackResolved, { config: pulumiConfig });
                        }

                        await options.beforeDeployStack?.({ command: this, stack });

                        return deployStack(stackResolved, {
                            refresh: this.refresh,
                            build: !this.skipBuild,
                            debug: this.debug,
                            config: pulumiConfig,
                            verbosity: this.verbosity,
                            skipResources: this.skipResources,
                        });
                    })()
                        .then(async () => {
                            stacksDeploying.delete(stack);
                            stacksDeployed.add(stack);
                            stacksLeft.delete(stack);
                            stackResolved.logger.info(`🎉 Deployed stack ${stackName}`);
                            await options.afterDeployStack?.({ command: this, stack });
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

            await options.afterDeploy?.({
                command: this,
                stacksDeployed: [...stacksDeployed],
                stacksFailed: [...stacksFailed.keys()],
            });

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

        skip = Option.Array('--skip,-s', [], {
            description: 'Skip specific stacks from being canceled (can be used multiple times)',
        });

        override async run() {
            await options.beforeEach?.({ command: this });

            const pulumiConfig = await getPulumiConfig(options);

            const stacks = resolveStacks({
                ...options,
                stackNames: this.stacks,
                skip: this.skip,
            });

            if (stacks.length === 0) {
                throw new UsageError('No stacks to cancel.');
            }

            await forEachParalell(stacks, {
                concurrency: 5,
                callback: async stack => {
                    const stackResolved = this.container.resolve(stack);
                    await cancelStack(stackResolved, {
                        config: pulumiConfig,
                    });

                    stackResolved.logger.info(`🚫 Canceled stack ${chalk.green(stack.stackName)}`);
                },
            });
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

        verbosity = Option.Counter('--verbose,-v', {
            description: 'The verbosity of the logs',
        });

        skipBuild = Option.Boolean('--skip-build,-sb', {
            description: 'Skip the build step',
        });

        skip = Option.Array('--skip,-s', [], {
            description: 'Skip specific stacks from being previewed (can be used multiple times)',
        });

        override async run() {
            await options.beforeEach?.({ command: this });

            const pulumiConfig = await getPulumiConfig(options);

            const stacks = resolveStacks({
                ...options,
                stackNames: this.stacks,
                skip: this.skip,
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
                    verbosity: this.verbosity,
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

        skip = Option.Array('--skip,-s', [], {
            description: 'Skip specific stacks from being refreshed (can be used multiple times)',
        });

        override async run() {
            await options.beforeEach?.({ command: this });

            const pulumiConfig = await getPulumiConfig(options);

            const stacks = resolveStacks({
                ...options,
                stackNames: this.stacks,
                skip: this.skip,
            });

            if (stacks.length === 0) {
                throw new UsageError('No stacks to refresh.');
            }

            await forEachParalell(stacks, {
                concurrency: 5,
                callback: async stack => {
                    const stackResolved = this.container.resolve(stack);
                    await refreshStack(stackResolved, {
                        config: pulumiConfig,
                    });

                    stackResolved.logger.info(`🔄 Refreshed stack ${chalk.green(stack.stackName)}`);
                },
            });
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
                ['Cancel previous and destroy', 'destroy --cancel core'],
                ['Preview destruction plan', 'destroy --preview'],
                ['Preview specific stacks', 'destroy --preview core api'],
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

        preview = Option.Boolean('--preview,-p', {
            description: 'Show which stacks would be destroyed without actually destroying them',
        });

        cancel = Option.Boolean('--cancel,-c', {
            description: 'Cancel previous deployment before destroying each stack',
        });

        skip = Option.Array('--skip,-s', [], {
            description: 'Skip specific stacks from being destroyed (can be used multiple times)',
        });

        stacks = Option.Rest();

        override async run() {
            await options.beforeEach?.({ command: this });

            if (options.preventDestroy) {
                throw new UsageError('Stack deletion is prohibited.');
            }

            const pulumiConfig = await getPulumiConfig(options);

            if (this.force) {
                if (!this.stacks.length) {
                    throw new UsageError('When using --force, you must specify stacks to destroy.');
                }

                const stacksToForceDestroy = this.stacks.filter(stack => !this.skip.includes(stack));

                for (const stack of stacksToForceDestroy) {
                    const stackDefinition = defineStack({
                        name: stack,
                        resources() {
                            return {};
                        },
                    });

                    const stackResolved = this.container.resolve(stackDefinition);
                    const stackName = chalk.bold(chalk.red(stack));

                    try {
                        if (this.cancel) {
                            stackResolved.logger.info(`🚫 Cancelling previous deployment for stack ${stackName}...`);
                            await cancelStack(stackResolved, { config: pulumiConfig });
                        }

                        await options.beforeDestroyStack?.({ command: this, stack: stackDefinition });

                        stackResolved.logger.info(`🗑️  Force destroying stack ${stackName}...`);

                        await destroyStack(stackResolved, {
                            config: pulumiConfig,
                            refresh: this.refresh,
                            remove: this.remove,
                        });

                        if (this.remove) {
                            stackResolved.logger.info(`💥 Force destroyed and removed stack ${stackName}`);
                        } else {
                            stackResolved.logger.info(`💥 Force destroyed stack ${stackName}`);
                        }

                        await options.afterDestroyStack?.({ command: this, stack: stackDefinition });
                    } catch (error) {
                        stackResolved.logger.error(`❌ Failed to force destroy stack ${stackName}.`, {
                            error,
                        });
                        throw error;
                    }
                }

                return;
            }

            const stacks = resolveStacks({
                ...options,
                stackNames: this.stacks,
                skip: this.skip,
            });

            if (stacks.length === 0) {
                throw new UsageError('No stacks to destroy.');
            }

            // Determine which stacks will actually be destroyed (filter out protected ones)
            const stacksToDestroy: StackDefinition[] = [];
            const protectedStacks: StackDefinition[] = [];

            for (const stack of [...stacks].reverse()) {
                const stackResolved = this.container.resolve(stack);
                if (stackResolved.preventDestroy) {
                    protectedStacks.push(stack);
                } else {
                    stacksToDestroy.push(stack);
                }
            }

            // Display the destruction plan
            console.log(chalk.bold('\n🗑️  Stack Destruction Plan\n'));

            if (stacksToDestroy.length > 0) {
                console.log(chalk.bold('The following stacks will be destroyed in this order:'));
                const padding = stacksToDestroy.length.toString().length + 1;

                stacksToDestroy.forEach((stack, index) => {
                    const number = chalk.gray(`${index + 1}.`.padStart(padding));
                    const stackName = chalk.red.bold(stack.stackName);
                    const removeFlag = this.remove ? chalk.gray(' [will be removed]') : '';
                    console.log(`${number}${stackName}${removeFlag}`);
                });
                console.log();
            }

            if (protectedStacks.length > 0) {
                console.log(chalk.bold('The following stacks are protected and will be skipped:'));
                const padding = protectedStacks.length.toString().length + 1;

                protectedStacks.forEach((stack, index) => {
                    const number = chalk.gray(`${index + 1}.`.padStart(padding));
                    const stackName = chalk.yellow.bold(stack.stackName);
                    const protection = chalk.gray(' [protected]');
                    console.log(`${number}${stackName}${protection}`);
                });
                console.log();
            }

            if (stacksToDestroy.length === 0) {
                console.log(chalk.yellow('No stacks will be destroyed - all selected stacks are protected.'));
                return;
            }

            // If preview mode, exit here without proceeding
            if (this.preview) {
                console.log(chalk.blue('Preview mode - no stacks will actually be destroyed.'));
                return;
            }

            // Proceed with destruction
            for (const stack of stacksToDestroy) {
                const stackResolved = this.container.resolve(stack);
                const stackName = chalk.bold(chalk.red(stack.stackName));

                try {
                    if (this.cancel) {
                        stackResolved.logger.info(`🚫 Cancelling previous deployment for stack ${stackName}...`);
                        await cancelStack(stackResolved, { config: pulumiConfig });
                    }

                    await options.beforeDestroyStack?.({ command: this, stack });

                    stackResolved.logger.info(`🗑️  Destroying stack ${stackName}...`);

                    await destroyStack(stackResolved, {
                        config: pulumiConfig,
                        refresh: this.refresh,
                        remove: this.remove,
                    });

                    if (this.remove) {
                        stackResolved.logger.info(`💥 Destroyed and removed stack ${stackName}`);
                    } else {
                        stackResolved.logger.info(`💥 Destroyed stack ${stackName}`);
                    }

                    await options.afterDestroyStack?.({ command: this, stack });
                } catch (error) {
                    stackResolved.logger.error(`❌ Failed to destroy stack ${stackName}.`, {
                        error,
                    });
                    throw error;
                }
            }

            // Show warning for any protected stacks that were skipped
            if (protectedStacks.length > 0) {
                console.log(chalk.yellow(`\n⚠️  Skipped ${protectedStacks.length} protected stack(s).`));
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
            await options.beforeEach?.({ command: this });

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

function defineInstallCommand(options: PulumiCommandsOptions) {
    return class InstallCommand extends Command {
        static override paths = getCommandPaths(options, 'install');
        static override usage = Command.Usage({
            category: 'Pulumi',
            description: 'Install dependencies for stacks',
            details: 'Install dependencies for the selected stacks',
            examples: [
                ['Install all stacks', 'install'],
                ['Install single stack', 'install core'],
                ['Install multiple stacks', 'install core api'],
            ],
        });

        stacks = Option.Rest();

        skip = Option.Array('--skip,-s', [], {
            description: 'Skip specific stacks from being installed (can be used multiple times)',
        });

        override async run() {
            await options.beforeEach?.({ command: this });

            const pulumiConfig = await getPulumiConfig(options);

            const stacks = resolveStacks({
                ...options,
                stackNames: this.stacks,
                skip: this.skip,
            });

            if (stacks.length === 0) {
                throw new UsageError('No stacks to install.');
            }

            for (const stack of stacks) {
                const stackResolved = this.container.resolve(stack);
                const stackName = chalk.bold(chalk.green(stack.stackName));

                stackResolved.logger.info(`📦 Installing dependencies for stack ${stackName}...`);

                const stackInstance = await createOrSelectStack(stackResolved, pulumiConfig);
                await installStack(stackInstance);

                stackResolved.logger.info(`✅ Installed dependencies for stack ${stackName}`);
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

    const stacks = sortByDependency([...stacksSet]);

    if (options.skip && options.skip.length > 0) {
        return stacks.filter(stack => !options.skip!.includes(stack.stackName));
    }

    return stacks;
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
