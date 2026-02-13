import type { SomeObject } from '@nzyme/types/Object.js';

import type { ContainerScope } from './ContainerScope.js';
import { defineService } from './Service.js';
import type { Dependencies, ResolveDeps, Service } from './Service.js';

/**
 * Represents a factory service that creates instances with additional parameters.
 * Dependencies are resolved once (singleton), and the factory function can be called
 * multiple times with different parameters.
 *
 * @template T - The type that the factory creates
 * @template P - The parameter types that the factory accepts
 * @template TDeps - The type of the factory's dependencies
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Factory<T = unknown, P extends unknown[] = unknown[], TDeps extends Dependencies = any> = Service<
    (...args: P) => T,
    TDeps
>;

/**
 * Configuration options for defining a factory.
 *
 * @template T - The type that the factory creates
 * @template TExtend - Extended type (for inheritance)
 * @template P - The parameter types that the factory accepts
 * @template TDeps - The type of the factory's dependencies
 */
export interface FactoryOptions<
    T = unknown,
    TExtend extends T = T,
    P extends unknown[] = unknown[],
    TDeps extends Dependencies = Dependencies,
> {
    /**
     * Optional name of the factory for debugging and identification.
     */
    readonly name?: string;

    /**
     * Optional dependencies required by this factory.
     */
    readonly deps?: TDeps;

    /**
     * Optional scope that controls the factory's lifecycle.
     */
    readonly scope?: ContainerScope;

    /**
     * Function that creates instances with resolved dependencies and additional parameters.
     * @param deps - The resolved dependencies
     * @param args - Additional parameters passed to the factory
     * @returns The created instance
     */
    readonly setup: FactorySetup<TDeps, TExtend, P>;
}

/**
 * Setup function type for factories.
 * Receives resolved dependencies and additional parameters.
 *
 * @template TDeps - The type of the factory's dependencies
 * @template T - The type that the factory creates
 * @template P - The parameter types that the factory accepts
 */
export interface FactorySetup<TDeps extends Dependencies, T, P extends unknown[]> {
    (deps: ResolveDeps<TDeps>, ...args: P): T;
}

/**
 * Creates a new factory service with the specified options.
 * The factory resolves its dependencies once (singleton strategy),
 * then returns a function that can be called with additional parameters.
 *
 * @template T - The type that the factory creates
 * @template TExtend - Extended type (for inheritance)
 * @template P - The parameter types that the factory accepts
 * @template TDeps - The type of the factory's dependencies
 * @param options - Configuration options for the factory
 * @returns A new factory service
 *
 * @example
 * ```typescript
 * const UserFactory = defineFactory({
 *     name: 'UserFactory',
 *     deps: { db: DatabaseService },
 *     setup(deps, id: string, name: string) {
 *         return { id, name, db: deps.db };
 *     },
 * });
 *
 * // Usage:
 * const factory = container.resolve(UserFactory);
 * const user1 = factory('1', 'Alice');
 * const user2 = factory('2', 'Bob');
 * ```
 *
 * @__NO_SIDE_EFFECTS__
 */
export function defineFactory<
    T,
    TExtend extends T = T,
    P extends unknown[] = unknown[],
    TDeps extends Dependencies = SomeObject,
>(options: FactoryOptions<T, TExtend, P, TDeps>): Factory<TExtend, P, TDeps> {
    return defineService<(...args: P) => T, (...args: P) => TExtend, TDeps>({
        name: options.name,
        deps: options.deps,
        scope: options.scope,
        setup: deps => {
            return (...args: P) => options.setup(deps, ...args);
        },
    }) as Factory<TExtend, P, TDeps>;
}
