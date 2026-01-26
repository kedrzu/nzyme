import type { Unwrap } from '@pulumi/pulumi';
import type { automation } from '@pulumi/pulumi';
import * as pulumi from '@pulumi/pulumi';

import type { Dependencies, Injectable, ResolveDeps, Service } from '@nzyme/ioc';
import { defineInjectable, defineService } from '@nzyme/ioc';
import { Logger } from '@nzyme/logging';
import type { EmptyObject, Flatten, Override, SomeObject } from '@nzyme/types';
import { createMemo, toPascalCase } from '@nzyme/utils';

import { unwrapStackOutput } from './utils/unwrapStackOutput.js';

const STACK_SYMBOL = Symbol('Stack');

/**
 * Output of a Pulumi stack.
 */
export type StackOutput = Record<string, unknown>;

/**
 * Value of a stack output.
 */
export type StackOutputValue<T = unknown> = {
    /**
     * Whether the output is a secret.
     */
    secret: boolean;

    /**
     * Value of the output.
     */
    value: T;
};

/**
 * Options for defining a stack.
 */
export interface StackOptions<TDeps extends Dependencies = Dependencies, TOutput extends StackOutput = StackOutput> {
    /**
     * Name of the stack.
     */
    name: string;

    /**
     * Dependencies of the stack.
     */
    deps?: TDeps;

    /**
     * Whether to enable the stack.
     * @default true
     */
    enabled?: boolean;

    /**
     * Whether to prevent the stack from being destroyed.
     */
    preventDestroy?: boolean;

    /**
     * Resources to deploy.
     */
    resources(this: Stack, deps: ResolveDeps<TDeps>): TOutput;

    /**
     * Program to run before the stack is deployed.
     */
    build?(this: Stack, deps: ResolveDeps<TDeps>, ctx: StackBuildContext): Promise<void> | void;

    /**
     * Program to run before the stack is deployed.
     */
    beforeDeploy?(this: Stack, deps: ResolveDeps<TDeps>): Promise<void> | void;

    /**
     * Program to run after the stack is deployed.
     */
    afterDeploy?(this: Stack, output: Unwrap<TOutput>, deps: ResolveDeps<TDeps>): Promise<void> | void;

    /**
     * Program to run before the stack is destroyed.
     */
    beforeDestroy?(this: Stack, output: Partial<Unwrap<TOutput>>, deps: ResolveDeps<TDeps>): Promise<void> | void;

    /**
     * Program to run after the stack is destroyed.
     */
    afterDestroy?(this: Stack, output: Partial<Unwrap<TOutput>>, deps: ResolveDeps<TDeps>): Promise<void> | void;

    /**
     * Program to run when an event occurs.
     */
    onEvent?: (this: void, event: automation.EngineEvent) => Promise<void> | void;
}

/**
 * Parameters for the {@link Stack.build} function.
 */
export interface StackBuildContext {
    /**
     * Whether the stack is being previewed.
     */
    preview: boolean;
}

/**
 * Definition of a Pulumi stack.
 */
export interface Stack<TOutput extends StackOutput = StackOutput> {
    /**
     * Name of the stack.
     */
    name: string;

    /**
     * Whether the stack is enabled.
     */
    enabled: boolean;

    /**
     * Whether to prevent the stack from being destroyed.
     */
    preventDestroy: boolean;

    /**
     * Logger.
     */
    logger: Logger;

    /**
     * Program to run for the stack.
     */
    resources: () => TOutput;

    /**
     * Get the outputs of the stack.
     */
    outputs: (stack: automation.Stack) => Promise<Unwrap<TOutput>>;

    /**
     * Function to run before the stack is deployed.
     */
    build: (params: StackBuildContext) => Promise<void> | void;

    /**
     * Function to run before the stack is deployed.
     */
    beforeDeploy: () => Promise<void>;

    /**
     * Function to run after the stack is deployed.
     */
    afterDeploy: (output: Record<string, unknown>) => Promise<void>;

    /**
     * Function to run before the stack is destroyed.
     */
    beforeDestroy: (output: Record<string, unknown>) => Promise<void>;

    /**
     * Function to run after the stack is destroyed.
     */
    afterDestroy: (output: Record<string, unknown>) => Promise<void>;
}

/**
 * Definition of a Pulumi stack.
 */
export interface StackDefinition<
    TDeps extends Dependencies = Dependencies,
    TOutput extends StackOutput = StackOutput,
> extends Service<Stack<TOutput>, TDeps> {
    /**
     * Name of the stack.
     */
    stackName: string;

    /**
     * Whether the stack is enabled.
     */
    enabled: boolean;

    /**
     * Whether to prevent the stack from being destroyed.
     */
    preventDestroy: boolean;

    /**
     * Create a stack reference injectable.
     */
    ref(): Injectable<StackReference<TOutput>>;

    /**
     * Symbol to identify the stack.
     * @internal
     */
    [STACK_SYMBOL]: true;
}

/**
 * Reference to a stack.
 */
export interface StackReference<TOutput extends StackOutput = StackOutput> {
    /**
     * Whether the stack is enabled.
     */
    enabled: boolean;

    /**
     * Get the output of the stack.
     */
    output<K extends keyof TOutput>(key: K & string): pulumi.Output<TOutput[K]>;
    /**
     * Get the output of the stack.
     */
    output<K extends keyof TOutput>(
        key: K & string,
        options?: { optional: boolean },
    ): pulumi.Output<TOutput[K] | undefined>;
}

/**
 * Type of the stack output.
 */
export type StackOutputOf<TStack extends StackDefinition> =
    TStack extends StackDefinition<Dependencies, infer TOutput> ? TOutput : never;

/**
 * Type of the stack reference.
 */
export type StackReferenceOf<TStack extends StackDefinition> = StackReference<StackOutputOf<TStack>>;

/**
 * Define a Pulumi stack.
 * @__NO_SIDE_EFFECTS__
 */
export function defineStack<TDeps extends Dependencies = SomeObject, TOutput extends StackOutput = EmptyObject>(
    options: StackOptions<TDeps, TOutput>,
) {
    const enabled = options.enabled ?? true;
    const preventDestroy = options.preventDestroy ?? false;
    const serviceName = `Stack:${toPascalCase(options.name)}`;
    type Deps = Override<TDeps, { logger: Injectable<Logger> }>;
    const depsDef = { ...options.deps, logger: Logger } as Deps;

    const service = defineService({
        name: serviceName,
        deps: depsDef,
        setup(depsInput) {
            const deps = depsInput as ResolveDeps<TDeps> & { logger: Logger };
            const name = options.name;
            const stack: Stack<TOutput> = {
                name,
                enabled,
                preventDestroy,
                logger: deps.logger,
                resources: () => {
                    const output = options.resources.call(stack, deps);
                    return output || {};
                },
                outputs: async (stack: automation.Stack) => {
                    return unwrapStackOutput<TOutput>(await stack.outputs());
                },
                build: async (ctx: StackBuildContext) => {
                    if (options.build) {
                        await options.build.call(stack, deps, ctx);
                    }
                },
                beforeDeploy: async () => {
                    await options.beforeDeploy?.call(stack, deps);
                },
                afterDeploy: async output => {
                    await options.afterDeploy?.call(stack, output as Unwrap<TOutput>, deps);
                },
                beforeDestroy: async output => {
                    await options.beforeDestroy?.call(stack, output as Partial<Unwrap<TOutput>>, deps);
                },
                afterDestroy: async output => {
                    await options.afterDestroy?.call(stack, output as Partial<Unwrap<TOutput>>, deps);
                },
            };

            return stack;
        },
    });

    const stackDef: StackDefinition<Deps, TOutput> = {
        ...service,
        enabled,
        preventDestroy,
        stackName: options.name,
        [STACK_SYMBOL]: true,
        ref: () =>
            defineInjectable({
                deps: { stackDef },
                resolve: () => createStackReference(stackDef),
            }),
    };

    return stackDef as unknown as StackDefinition<TDeps, Flatten<pulumi.Unwrap<TOutput>>>;
}

/**
 * Check if an object is a stack definition.
 */
export function isStackDefinition(obj: unknown): obj is StackDefinition {
    return obj instanceof Object && STACK_SYMBOL in obj;
}

function createStackReference<TDeps extends Dependencies, TOutput extends StackOutput>(
    stack: StackDefinition<TDeps, TOutput>,
): StackReference<TOutput> {
    const ref = createMemo(() => {
        const org = pulumi.getOrganization();
        const project = pulumi.getProject();
        const path = `${org}/${project}/${stack.stackName}`;
        return new pulumi.StackReference(path);
    });

    return {
        enabled: stack.enabled,
        output<K extends keyof TOutput>(key: K & string, options?: { optional: boolean }): pulumi.Output<TOutput[K]> {
            if (options?.optional) {
                return ref().getOutput(key) as pulumi.Output<TOutput[K]>;
            }

            return ref().requireOutput(key) as pulumi.Output<TOutput[K]>;
        },
    };
}
