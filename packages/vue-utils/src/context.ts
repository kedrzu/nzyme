import { inject, provide } from 'vue';
import type { InjectionKey } from 'vue';

import { identity } from '@nzyme/utils/functions/identity.js';

export interface ContextConstructor<TParams extends unknown[], TContext> {
    (this: void, ...params: TParams): TContext;
}

export interface ContextDefinition<TParams extends unknown[], TContext> {
    readonly name: string;
    readonly setup: ContextConstructor<TParams, TContext>;
    readonly symbol: InjectionKey<TContext>;
}

export type ContextOf<T> =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    T extends ContextDefinition<any, infer TContext> ? TContext : never;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ContextParams<T> = T extends ContextDefinition<infer TParams, any> ? TParams : never;

/**
 *
 * @__NO_SIDE_EFFECTS__
 */
export function defineContext<TContext>(name: string): ContextDefinition<[context: TContext], TContext>;
/**
 *
 * @__NO_SIDE_EFFECTS__
 */
export function defineContext<TParams extends unknown[], TContext>(
    name: string,
    context: ContextConstructor<TParams, TContext>,
): ContextDefinition<TParams, TContext>;
/**
 *
 * @__NO_SIDE_EFFECTS__
 */
export function defineContext<TParams extends unknown[], TContext>(
    name: string,
    context?: ContextConstructor<TParams, TContext>,
): ContextDefinition<TParams, TContext> {
    return {
        name,
        setup: context || (identity as unknown as ContextConstructor<TParams, TContext>),
        symbol: Symbol(),
    };
}

export function provideContext<TParams extends unknown[], TContext>(
    context: ContextDefinition<TParams, TContext>,
    ...params: TParams
) {
    const instance = context.setup(...params);
    provide(context.symbol, instance);
    return instance;
}

export function injectContext<TParams extends unknown[], TContext>(
    context: ContextDefinition<TParams, TContext>,
): TContext;
export function injectContext<TParams extends unknown[], TContext>(
    context: ContextDefinition<TParams, TContext>,
    opts: { optional: boolean },
): TContext | null;
export function injectContext<TParams extends unknown[], TContext>(
    context: ContextDefinition<TParams, TContext>,
    opts?: { optional: boolean },
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
