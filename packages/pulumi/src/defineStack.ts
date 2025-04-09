import * as pulumi from '@pulumi/pulumi';
import type { automation } from '@pulumi/pulumi';
import type { OutputMap } from '@pulumi/pulumi/automation/stack.js';

import type { ResolveDependencies, ServiceDependencies } from '@nzyme/ioc';
import { defineService } from '@nzyme/ioc';
import type { EmptyObject } from '@nzyme/types';
import { toPascalCase } from '@nzyme/utils';

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
 * Result of a stack output.
 */
export type StackOutputResult<TOutput extends StackOutput> = {
    [K in keyof TOutput]: StackOutputValue<TOutput[K]>;
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
     * Project name.
     */
    project: string;

    /**
     * Organization name.
     */
    organization?: string;

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
    resources: (deps: ResolveDependencies<TDeps>) => Promise<TOutput> | TOutput;

    /**
     * Program to run before the stack is deployed.
     */
    build?: (deps: ResolveDependencies<TDeps>, ctx: StackBuildContext) => Promise<void> | void;

    /**
     * Program to run after the stack is deployed.
     */
    afterDeploy?: (
        output: pulumi.Unwrap<TOutput>,
        deps: ResolveDependencies<TDeps>,
    ) => Promise<void> | void;
}

/**
 * Parameters for the {@link StackDefinition.build} function.
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
export interface StackDefinition<TOutput extends StackOutput = StackOutput> {
    /**
     * Name of the stack.
     */
    name: string;

    /**
     * Project name.
     */
    project: string;

    /**
     * Organization name.
     */
    organization?: string;

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
    outputs: (stack: automation.Stack) => Promise<pulumi.Unwrap<TOutput>>;

    /**
     * Function to run before the stack is deployed.
     */
    build: (params: StackBuildContext) => Promise<void> | void;

    /**
     * Function to run after the stack is deployed.
     */
    afterDeploy: (output: OutputMap) => Promise<void> | void;
}

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
 */
export function defineStack<
    TDeps extends ServiceDependencies = EmptyObject,
    TOutput extends StackOutput = EmptyObject,
>(options: StackOptions<TDeps, TOutput>) {
    return defineService({
        name: `Stack:${toPascalCase(options.name)}`,
        deps: options.deps,
        setup(deps): StackDefinition<TOutput> {
            const name = options.name;
            const project = options.project;
            const organization = options.organization;

            return {
                name,
                project,
                organization,
                enabled: options.enabled ?? true,
                ref: () => {
                    const org = organization ?? 'organization';
                    const path = `${org}/${project}/${name}`;
                    return createStackReference(path);
                },
                resources: async () => {
                    const output = await options.resources(deps);
                    return output || {};
                },
                outputs: async (stack: automation.Stack) => {
                    return unwrapOutput(await stack.outputs()) as pulumi.Unwrap<TOutput>;
                },
                build: async (ctx: StackBuildContext) => {
                    if (options.build) {
                        await options.build(deps, ctx);
                    }
                },
                afterDeploy: async output => {
                    if (options.afterDeploy) {
                        await options.afterDeploy(
                            unwrapOutput(output) as pulumi.Unwrap<TOutput>,
                            deps,
                        );
                    }
                },
            };
        },
    });
}

function createStackReference<TOutput extends StackOutput>(path: string): StackReference<TOutput> {
    const ref = new pulumi.StackReference(path);

    return {
        getOutput: <K extends keyof TOutput>(key: K & string): TOutput[K] =>
            ref.getOutput(key) as TOutput[K],
    };
}

function unwrapOutput<TOutput extends StackOutput>(output: StackOutputResult<TOutput>) {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(output)) {
        result[key] = (value as StackOutputValue).value;
    }

    return result as TOutput;
}
