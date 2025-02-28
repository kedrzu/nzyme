import { noop, createMemo } from '@nzyme/utils';

import type { Container } from './Container.js';
import type { Injectable } from './Injectable.js';
import type { Service, ServiceOptions } from './Service.js';
import { resolveDeps } from './utils/resolveDeps.js';

export type ServiceResolutionParams = {
    service: Service;
    options: ServiceOptions;
    container: Container;
    caller?: Injectable;
};

export type ServiceResolutionStrategy = (params: ServiceResolutionParams) => unknown;
export type ServiceResolutionType = 'transient' | 'singleton' | 'lazy';

export function getResolutionStrategy(strategy: ServiceResolutionType | ServiceResolutionStrategy) {
    if (typeof strategy === 'function') {
        return strategy;
    }

    switch (strategy) {
        case 'transient':
            return transientStrategy;
        case 'singleton':
            return singletonStrategy;
        case 'lazy':
            return lazyStrategy;
        default:
            throw new Error(`Invalid service resolution strategy: ${strategy as string}`);
    }
}

export function singletonStrategy({
    service,
    options,
    container,
    caller,
}: ServiceResolutionParams) {
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

    const deps = resolveDeps(service.deps, container, caller);

    instance = options.setup(deps);
    container.set(service, instance);

    if (options.implements && !container.get(options.implements)) {
        container.set(options.implements, instance);
    }

    return instance;
}

export function transientStrategy({
    service,
    options,
    container,
    caller,
}: ServiceResolutionParams) {
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

    const deps = resolveDeps(service.deps, container, caller);
    return options.setup(deps);
}

export function lazyStrategy(params: ServiceResolutionParams) {
    // Short-circuit if already resolved
    const existing = params.container.get(params.service);
    if (existing) {
        return existing;
    }

    const memo = createMemo(() => singletonStrategy(params));
    const proxy = new Proxy(noop, {
        get: (target, prop) => {
            return (memo() as Record<string | symbol, unknown>)[prop];
        },
        set: (target, prop, value) => {
            (memo() as Record<string | symbol, unknown>)[prop] = value;
            return true;
        },
        has: (target, prop) => {
            return prop in (memo() as Record<string | symbol, unknown>);
        },
        apply: (target, thisArg, args: unknown[]) => {
            return (memo() as (...args: unknown[]) => unknown)(...args);
        },
    });

    return proxy;
}
