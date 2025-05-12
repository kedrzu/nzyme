import type { Unwrap } from '@pulumi/pulumi';
import type { automation } from '@pulumi/pulumi';
import * as pulumi from '@pulumi/pulumi';

import type { ResolveDeps, Service, ServiceDependencies } from '@nzyme/ioc';
import { defineService } from '@nzyme/ioc';
import type { EmptyObject, SomeObject } from '@nzyme/types';
import { toPascalCase } from '@nzyme/utils';

import { unwrapStackOutput } from './utils/unwrapStackOutput.js';

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
export interface StackOptions<
    TDeps extends ServiceDependencies = ServiceDependencies,
    TOutput extends StackOutput = StackOutput,
> {
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
     * Resources to deploy.
     */
    resources(this: Stack, deps: ResolveDeps<TDeps>): Promise<TOutput> | TOutput;

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
     * Create a reference to the stack.
     */
    ref: () => StackReference<TOutput>;

    /**
     * Program to run for the stack.
     */
    resources: () => Promise<TOutput>;

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
export type StackDefinition = Service<Stack>;

/**
 * Reference to a stack.
 */
export interface StackReference<TOutput extends StackOutput = StackOutput> {
    /**
     * Get the output of the stack.
     */
    getOutput<K extends keyof TOutput>(key: K & string): TOutput[K];
}

/**
 * Define a Pulumi stack.
 * @__NO_SIDE_EFFECTS__
 */
export function defineStack<TDeps extends ServiceDependencies = SomeObject, TOutput extends StackOutput = EmptyObject>(
    options: StackOptions<TDeps, TOutput>,
) {
    return defineService({
        name: `Stack:${toPascalCase(options.name)}`,
        deps: options.deps,
        setup(deps): Stack<TOutput> {
            const name = options.name;
            const stack: Stack<TOutput> = {
                name,
                enabled: options.enabled ?? true,
                ref: () => {
                    const org = pulumi.getOrganization();
                    const project = pulumi.getProject();
                    const path = `${org}/${project}/${name}`;
                    return createStackReference(path);
                },
                resources: async () => {
                    const output = await options.resources.call(stack, deps);
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
}

function createStackReference<TOutput extends StackOutput>(path: string): StackReference<TOutput> {
    const ref = new pulumi.StackReference(path);

    return {
        getOutput: <K extends keyof TOutput>(key: K & string): TOutput[K] => ref.getOutput(key) as TOutput[K],
    };
}
