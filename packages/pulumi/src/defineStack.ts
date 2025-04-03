import * as pulumi from '@pulumi/pulumi';
import type { automation } from '@pulumi/pulumi';

import type { ResolveDependencies, ServiceDependencies } from '@nzyme/ioc';
import { defineService } from '@nzyme/ioc';
import type { EmptyObject } from '@nzyme/types';
import { toPascalCase } from '@nzyme/utils';
import { OutputMap } from '@pulumi/pulumi/automation/stack.js';

/**
 * Output of a Pulumi stack.
 */
export type StackOutput = Record<string, unknown>;

/**
 * Result of a stack output.
 */
export type StackOutputResult<TOutput extends StackOutput> = {
    [K in keyof TOutput]: {
        /**
         * Whether the output is a secret.
         */
        secret: boolean;
        /**
         * Value of the output.
         */
        value: pulumi.Unwrap<TOutput[K]>;
    };
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
     * Setup function for the stack.
     */
    program: (deps: ResolveDependencies<TDeps>) => Promise<TOutput> | TOutput;

    /**
     * Program to run before the stack is deployed.
     */
    beforeDeploy?: (deps: ResolveDependencies<TDeps>) => Promise<void> | void;

    /**
     * Program to run after the stack is deployed.
     */
    afterDeploy?: (
        output: pulumi.Unwrap<TOutput>,
        deps: ResolveDependencies<TDeps>,
    ) => Promise<void> | void;
}

/**
 * Options for creating a stack reference.
 */
export interface StackReferenceOptions {
    /**
     * The project name to use for the stack.
     */
    project: string;

    /**
     * The organization name to use for the stack.
     */
    organization?: string;
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
     * Program to run for the stack.
     */
    program: () => Promise<TOutput>;

    /**
     * Create a reference to the stack.
     */
    ref: (options: StackReferenceOptions) => StackReference<TOutput>;

    /**
     * Get the outputs of the stack.
     */
    outputs: (stack: automation.Stack) => Promise<pulumi.Unwrap<TOutput>>;

    /**
     * Function to run before the stack is deployed.
     */
    beforeDeploy: () => Promise<void> | void;

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

            return {
                name,
                program: async () => {
                    const output = await options.program(deps);
                    return output || {};
                },
                ref: refOptions => {
                    const org = refOptions.organization ?? 'organization';
                    const path = `${org}/${refOptions.project}/${name}`;
                    return createStackReference(path);
                },
                outputs: async (stack: automation.Stack) => {
                    return unwrapOutput(await stack.outputs()) as pulumi.Unwrap<TOutput>;
                },
                beforeDeploy: async () => {
                    if (options.beforeDeploy) {
                        await options.beforeDeploy(deps);
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

function unwrapOutput<TOutput extends StackOutput>(output: StackOutputResult<TOutput>): TOutput {
    return Object.fromEntries(
        Object.entries(output).map(([key, value]) => [key, value.value]),
    ) as TOutput;
}
