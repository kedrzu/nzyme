import { inject, provide } from 'vue';
import type { InjectionKey } from 'vue';

import { identity } from '@nzyme/utils/functions/identity.js';

/** Factory function that creates a context instance from the given parameters. */
export interface ContextConstructor<TParams extends unknown[], TContext> {
    (this: void, ...params: TParams): TContext;
}

/** Defines a Vue provide/inject context with its name, factory, and injection key. */
export interface ContextDefinition<TParams extends unknown[], TContext> {
    /** Human-readable name used in error messages. */
    readonly name: string;
    /** Factory function that creates the context instance. */
    readonly setup: ContextConstructor<TParams, TContext>;
    /** Unique injection key for Vue provide/inject. */
    readonly symbol: InjectionKey<TContext>;
}

/** Extracts the context type from a ContextDefinition. */
export type ContextOf<T> =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    T extends ContextDefinition<any, infer TContext> ? TContext : never;

/** Extracts the parameter types from a ContextDefinition. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ContextParams<T> = T extends ContextDefinition<infer TParams, any> ? TParams : never;

/**
 * @__NO_SIDE_EFFECTS__
 */
export function defineContext<TContext>(name: string): ContextDefinition<[context: TContext], TContext>;
/**
 * @__NO_SIDE_EFFECTS__
 */
export function defineContext<TParams extends unknown[], TContext>(
    name: string,
    context: ContextConstructor<TParams, TContext>,
): ContextDefinition<TParams, TContext>;
/**
 * @__NO_SIDE_EFFECTS__
 */
export function defineContext<TParams extends unknown[], TContext>(
    name: string,
    context?: ContextConstructor<TParams, TContext>,
): ContextDefinition<TParams, TContext> {
    return {
        name,
        setup: context || (identity as unknown as ContextConstructor<TParams, TContext>),
        symbol: Symbol(name),
    };
}

/** Creates a context instance and provides it to descendant components via Vue's provide/inject. */
export function provideContext<TParams extends unknown[], TContext>(
    context: ContextDefinition<TParams, TContext>,
    ...params: TParams
) {
    const instance = context.setup(...params);
    provide(context.symbol, instance);
    return instance;
}

/** Injects a context provided by an ancestor component. Throws if not found. */
export function injectContext<TParams extends unknown[], TContext>(
    context: ContextDefinition<TParams, TContext>,
): TContext;
/** Injects a context provided by an ancestor component, returning null if not found when optional. */
export function injectContext<TParams extends unknown[], TContext>(
    context: ContextDefinition<TParams, TContext>,
    opts: {
        /** When true, returns null instead of throwing if context is not found. */
        optional: boolean;
    },
): TContext | null;
/** Injects a context provided by an ancestor component. */
export function injectContext<TParams extends unknown[], TContext>(
    context: ContextDefinition<TParams, TContext>,
    opts?: {
        /** When true, returns null instead of throwing if context is not found. */
        optional: boolean;
    },
): TContext | null {
    const instance = inject<TContext | null>(context.symbol, null);
    if (!instance) {
        if (opts?.optional) {
            return null;
        }

        throw new Error(`Context ${context.name} was not registered`);
    }

    return instance;
}
