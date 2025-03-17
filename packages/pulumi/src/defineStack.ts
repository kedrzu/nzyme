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
            return {
                name: options.name,
                program: async () => {
                    const output = await options.setup(deps);
                    return output || {};
                },
            };
        },
    });
}
