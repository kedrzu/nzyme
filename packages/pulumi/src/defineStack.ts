import type { automation, Unwrap } from '@pulumi/pulumi';
import * as pulumi from '@pulumi/pulumi';

import type { Injectable } from '@nzyme/ioc/Injectable.js';
import { defineInjectable } from '@nzyme/ioc/Injectable.js';
import type { Dependencies, ResolveDeps, Service } from '@nzyme/ioc/Service.js';
import { defineService } from '@nzyme/ioc/Service.js';
import { Logger } from '@nzyme/logging/Logger.js';
import type { Override } from '@nzyme/types/Common.js';
import type { EmptyObject } from '@nzyme/types/EmptyObject.js';
import type { Flatten, SomeObject } from '@nzyme/types/Object.js';
import { createMemo } from '@nzyme/utils/createMemo.js';
import { toPascalCase } from '@nzyme/utils/string/caseUtils.js';

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
export interface StackOptions<
    TDeps extends Dependencies = Dependencies,
    TOutput extends StackOutput = StackOutput,
    TBuild = void,
> {
    /**
     * Full Pulumi stack name, unique within the project (e.g. `database-eu-central-1`, `dns-global`).
     * Drives both the IoC service identity and the Pulumi stack name. App-level factories build the
     * region-suffixed / `-global` name and pass it here; single-region stacks pass a bare name.
     */
    name: string;

    /**
     * AWS region for this stack's default provider — written as `aws:region` in the stack config. When
     * omitted, the stack uses the shared default region (single-region behavior).
     */
    region?: string;

    /**
     * Pulumi project for this stack. Optional — defaults to the single project in
     * {@link PulumiConfig.project}. Reserved for future per-residency-zone project/account isolation
     * and cross-project references; not used today.
     */
    project?: string;

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
    resources(this: Stack, deps: ResolveDeps<TDeps>, buildResult: TBuild): TOutput;

    /**
     * Program to run before the stack is deployed.
     * Return value is passed to resources() as the second argument.
     */
    build?(this: Stack, deps: ResolveDeps<TDeps>, ctx: StackBuildContext): Promise<TBuild> | TBuild;

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
     * AWS region for this stack's default provider (from the `region` option). Undefined falls back to
     * the shared config region.
     */
    region?: string;

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
     * Pulumi project this stack belongs to, if not the default. Reserved for future cross-project
     * references; resolves the {@link StackReference} path when set.
     */
    project?: string;

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
export function defineStack<
    TDeps extends Dependencies = SomeObject,
    TOutput extends StackOutput = EmptyObject,
    TBuild = void,
>(options: StackOptions<TDeps, TOutput, TBuild>) {
    const enabled = options.enabled ?? true;
    const preventDestroy = options.preventDestroy ?? false;
    // Identity (IoC service + Pulumi stack name) derives from the full `name`, so two instances of the
    // same logical stack (e.g. per region) never collide — the app-level factory bakes the region into
    // the name it passes here.
    const stackName = options.name;
    const region = options.region;
    const serviceName = `Stack:${toPascalCase(stackName)}`;
    type Deps = Override<TDeps, { logger: Injectable<Logger> }>;
    const depsDef = { ...options.deps, logger: Logger } as Deps;

    const service = defineService({
        name: serviceName,
        deps: depsDef,
        setup(depsInput) {
            const deps = depsInput as ResolveDeps<TDeps> & { logger: Logger };
            let buildResult: TBuild;
            const stack: Stack<TOutput> = {
                name: stackName,
                region,
                enabled,
                preventDestroy,
                logger: deps.logger,
                resources: () => {
                    const output = options.resources.call(stack, deps, buildResult);
                    return output || {};
                },
                outputs: async (automationStack: automation.Stack) => {
                    return unwrapStackOutput<TOutput>(await automationStack.outputs());
                },
                build: async (ctx: StackBuildContext) => {
                    if (options.build) {
                        buildResult = await options.build.call(stack, deps, ctx);
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
        stackName,
        project: options.project,
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
        // A stack may target a different Pulumi project (reserved for future cross-zone isolation);
        // otherwise the reference resolves within the consumer's own project.
        const project = stack.project ?? pulumi.getProject();
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
