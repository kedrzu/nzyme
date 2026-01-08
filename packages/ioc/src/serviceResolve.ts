import { createMemo, noop } from '@nzyme/utils';

import type { Container } from './Container.js';
import type { Injectable } from './Injectable.js';
import type { Service } from './Service.js';
import { resolveDeps } from './utils/resolveDeps.js';

/**
 * Function that determines how a service instance is created and cached.
 *
 * @param service - The service to resolve
 * @param container - The container used for dependency resolution
 * @param caller - Optional injectable that requested this resolution
 * @returns The resolved service instance
 */
export type ServiceResolutionStrategy = (service: Service, container: Container, caller?: Injectable) => unknown;

/**
 * Built-in service resolution strategies:
 * - 'transient': Creates a new instance on each resolution
 * - 'singleton': Creates and caches a single instance
 * - 'lazy': Creates a proxy that resolves to a singleton on first use
 */
export type ServiceResolutionType = 'lazy' | 'singleton' | 'transient';

/**
 * Creates a new service resolution strategy.
 * This is a type-safe wrapper that ensures the function matches the ServiceResolutionStrategy interface.
 *
 * @param strategy - The function that implements the resolution strategy
 * @returns The same function, properly typed as a ServiceResolutionStrategy
 * @__NO_SIDE_EFFECTS__
 */
export function defineResolutionStrategy(strategy: ServiceResolutionStrategy) {
    return strategy;
}

/**
 * Gets the resolution strategy function for a given strategy type or function.
 *
 * @param strategy - The strategy type or function
 * @returns The resolution strategy function
 * @throws Error if the strategy type is invalid
 */
export function getResolutionStrategy(strategy: ServiceResolutionStrategy | ServiceResolutionType) {
    if (typeof strategy === 'function') {
        return strategy;
    }

    switch (strategy) {
        case 'lazy':
            return lazyStrategy;
        case 'singleton':
            return singletonStrategy;
        case 'transient':
            return transientStrategy;
        default:
            throw new Error(`Invalid service resolution strategy: ${strategy as string}`);
    }
}

/**
 * Resolution strategy that creates and caches a single instance of the service.
 * The instance is:
 * - Created on first resolution
 * - Cached in the container
 * - Reused for subsequent resolutions
 * - Scoped to the container's scope
 */
export const singletonStrategy = defineResolutionStrategy((service, container) => {
    let instance = container.get(service);
    if (instance) {
        return instance;
    }

    while (container.scope !== service.scope) {
        if (!container.parent) {
            throw new Error(
                `Container with required scope ${service.scope?.name} not found for service ${service.name}`,
            );
        }

        container = container.parent;

        instance = container.get(service);
        if (instance) {
            return instance;
        }
    }

    const deps: unknown = resolveDeps(service.deps, container, service);

    instance = service.create(deps);
    container.set(service, instance);

    if (service.implements && !container.get(service.implements)) {
        container.set(service.implements, instance);
    }

    return instance;
});

/**
 * Resolution strategy that creates a new instance of the service on each resolution.
 * The instance is:
 * - Created on each resolution
 * - Not cached in the container
 * - Scoped to the container's scope
 */
export const transientStrategy = defineResolutionStrategy((service, container, caller) => {
    if (service.scope) {
        while (container.scope !== service.scope) {
            if (!container.parent) {
                throw new Error(
                    `Container with required scope ${service.scope?.name} not found for service ${service.name}`,
                );
            }

            container = container.parent;
        }
    }

    const deps: unknown = resolveDeps(service.deps, container, caller);
    return service.create(deps);
});

/**
 * Resolution strategy that creates a proxy that resolves to a singleton on first use.
 * The proxy:
 * - Is created immediately
 * - Defers instance creation until first use
 * - Caches the instance after creation
 * - Forwards all operations to the cached instance
 */
export const lazyStrategy = defineResolutionStrategy((service, container, caller) => {
    // Short-circuit if already resolved
    const existing = container.get(service);
    if (existing) {
        return existing;
    }

    const memo = createMemo(() => singletonStrategy(service, container, caller));
    const proxy = new Proxy(noop, {
        get: (_target, prop) => {
            return (memo() as Record<string | symbol, unknown>)[prop];
        },
        set: (_target, prop, value) => {
            (memo() as Record<string | symbol, unknown>)[prop] = value;
            return true;
        },
        has: (_target, prop) => {
            return prop in (memo() as Record<string | symbol, unknown>);
        },
        apply: (_target, _thisArg, args: unknown[]) => {
            return (memo() as (...args: unknown[]) => unknown)(...args);
        },
    });

    return proxy;
});
