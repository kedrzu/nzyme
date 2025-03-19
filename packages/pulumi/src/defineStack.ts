import * as pulumi from '@pulumi/pulumi';

import type { ResolveDependencies, ServiceDependencies } from '@nzyme/ioc';
import { defineService } from '@nzyme/ioc';
import type { EmptyObject } from '@nzyme/types';
import { toPascalCase } from '@nzyme/utils';

/**
 * Output of a Pulumi stack.
 */
export type StackOutput = Record<string, unknown>;

/**
 * Options for defining a stack.
 */
export interface StackOptions<
    TDeps extends ServiceDependencies = ServiceDependencies,
    TOutput extends StackOutput | void = StackOutput | void,
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
    setup: (deps: ResolveDependencies<TDeps>) => Promise<TOutput> | TOutput;
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
                    const output = await options.setup(deps);
                    return output || {};
                },
                ref: refOptions => {
                    const org = refOptions.organization ?? 'organization';
                    const path = `${org}/${refOptions.project}/${name}`;
                    return createStackReference(path);
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
