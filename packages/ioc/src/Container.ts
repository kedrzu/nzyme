import type { ContainerScope } from './ContainerScope.js';
import { defineInjectable, type Injectable, isInjectable } from './Injectable.js';
import type { Interface } from './Interface.js';
import type { Module } from './Module.js';
import { isService, type Service } from './Service.js';

/**
 * Symbol used to identify container instances.
 * @internal
 */
export const CONTAINER_SYMBOL = Symbol('container');

/**
 * A dependency injection container that manages the lifecycle and resolution of services.
 * Provides methods for registering, resolving, and managing dependencies.
 */
export type Container = {
    /**
     * Registers a module with the container and executes its initialization logic.
     * @template TParams - Type of the module's parameters
     * @template TResult - Type of the module's result
     * @param module - The module to register
     * @param params - Parameters to pass to the module
     */
    addModule<TParams extends unknown[], TResult>(
        this: void,
        module: Module<TParams, TResult>,
        ...params: TParams
    ): void;
    /**
     * Symbol used to identify container instances.
     * @internal
     */
    readonly [CONTAINER_SYMBOL]: true;
    /**
     * Creates a new child container with the specified scope.
     * @param scope - The scope for the new child container
     * @returns A new child container instance
     */
    createChild(this: void, scope: ContainerScope): Container;
    /**
     * Retrieves an instance or injectable from the container.
     * @template T - The type of the injectable
     * @param injectable - The injectable to retrieve
     * @returns The instance or injectable if found, undefined otherwise
     */
    get<T>(this: void, injectable: Injectable<T>): Injectable<T> | T | undefined;
    /**
     * Optional parent container in the dependency injection hierarchy.
     */
    readonly parent?: Container;
    /**
     * Resolves an injectable to its concrete instance.
     * @template T - The type of the injectable
     * @param injectable - The injectable to resolve
     * @param source - Optional source interface for resolution
     * @returns The resolved instance
     * @throws Error if the injectable cannot be resolved
     */
    resolve<T>(this: void, injectable: Injectable<T>, source?: Interface): T;
    /**
     * Optional scope that defines the lifecycle and visibility of services.
     */
    readonly scope?: ContainerScope;
    /**
     * Registers an instance in the container.
     * @template T - The type of the instance
     * @param injectable - The injectable to associate with the instance
     * @param instance - The instance to register
     */
    set<T>(this: void, injectable: Injectable<T>, instance: T): void;
    /**
     * Registers a service in the container.
     * @template T - The type of the service
     * @param injectable - The injectable to associate with the service
     * @param service - The service to register
     */
    set<T>(this: void, injectable: Injectable<T>, service: Injectable<T>): void;
    /**
     * Attempts to resolve an injectable, returning undefined if resolution fails.
     * @template T - The type of the injectable
     * @param injectable - The injectable to resolve
     * @param source - Optional source interface for resolution
     * @returns The resolved instance if successful, undefined otherwise
     */
    tryResolve<T>(this: void, injectable: Injectable<T>, source?: Interface): T | undefined;
};

/**
 * Configuration options for creating a new container instance.
 */
export type ContainerOptions = {
    /**
     * Optional custom function for creating child containers.
     * @param scope - The scope for the new child container
     * @returns A new child container instance
     */
    createChild?: (scope: ContainerScope) => Container;
    /**
     * Optional parent container for hierarchical dependency injection.
     * When specified, the container will delegate unresolved dependencies to its parent.
     */
    parent?: Container;
    /**
     * Optional custom resolution strategy for services.
     * @param service - The service to resolve
     * @param scope - Optional source interface for resolution
     * @returns The resolved service instance
     */
    resolve?: (service: Service, scope?: Interface) => unknown;
    /**
     * Optional scope that defines the lifecycle and visibility of services within the container.
     */
    scope?: ContainerScope;
};

/**
 * Injectable that provides access to the container itself.
 * Useful for services that need to perform custom dependency resolution.
 */
export const Container = defineInjectable({
    name: 'Container',
    resolve: container => container,
});

/**
 * Creates a new dependency injection container with the specified options.
 * @param options - Optional configuration for the container
 * @returns A new container instance
 */
// #__NO_SIDE_EFFECTS__
export function createContainer(options?: ContainerOptions) {
    const instances = new Map<object, unknown>();
    const injectables = new Map<object, Injectable>();
    const parent = options?.parent;
    const scope = options?.scope;
    const resolve = options?.resolve ?? ((service, source) => service.resolve(container, source));
    const createChild =
        options?.createChild ?? (scope => createContainer({ parent: container, scope }));

    const container: Container = {
        [CONTAINER_SYMBOL]: true,
        scope,
        parent,
        addModule: (module, ...params) => module(container, ...params),
        createChild,
        get,
        set,
        resolve: injectable => injectable.resolve(container),
        tryResolve,
    };

    return container;

    function get<T>(injectable: Injectable<T>): Injectable<T> | T | undefined {
        return (
            (instances.get(injectable) as T | undefined) ??
            (injectables.get(injectable) as Injectable<T> | undefined)
        );
    }

    function set<T>(injectable: Injectable<T>, instanceOrService: Service<T> | T): void {
        if (isInjectable(instanceOrService)) {
            injectables.set(injectable, instanceOrService);
        } else {
            instances.set(injectable, instanceOrService);
        }
    }

    function tryResolve<T>(injectable: Injectable<T>, source?: Interface): T | undefined {
        const instance = instances.get(injectable) as T | undefined;
        if (instance) {
            return instance;
        }

        // Try to resolve as a registered service
        const service = injectables.get(injectable) as Service<T> | undefined;
        if (service) {
            return resolveService(service, source);
        }

        if (isService(injectable)) {
            return resolveService(injectable, source);
        }

        return parent?.tryResolve(injectable, source);
    }

    function resolveService<T>(service: Service<T>, source?: Interface): T | undefined {
        if (service.scope !== scope) {
            return parent?.tryResolve(service, source);
        }

        return resolve(service, source) as T | undefined;
    }
}

/**
 * Type guard to check if a value is a Container instance.
 * @param value - The value to check
 * @returns True if the value is a Container, false otherwise
 */
export function isContainer(value: unknown): value is Container {
    return typeof value === 'object' && value != null && CONTAINER_SYMBOL in value;
}
