import type { RequiredKeysOf } from 'type-fest';

import type { IfAny, IfLiteral, PartialOnUndefined, SomeObject } from '@nzyme/types';

import type { ContainerScope } from './ContainerScope.js';
import { INJECTABLE_SYMBOL } from './Injectable.js';
import type { Injectable } from './Injectable.js';
import type { Interface } from './Interface.js';
import { getResolutionStrategy } from './serviceResolve.js';
import type { ServiceResolutionStrategy, ServiceResolutionType } from './serviceResolve.js';

/**
 * Symbol used to identify service instances.
 * @internal
 */
const SERVICE_SYMBOL = Symbol('service');

/**
 * Transforms service dependencies into their resolved types.
 * For each dependency, extracts the type that its injectable resolves to.
 *
 * @template D - The service dependencies type
 * @returns A type with all dependencies resolved to their concrete types
 */
export type ResolveDeps<D extends ServiceDependencies> = IfLiteral<
    keyof D,
    ResolveDepsBase<D>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    D[keyof D] extends never ? void : any
>;

/**
 * Type that represents a service constructor.
 *
 * @template T - The type that the service will resolve to
 * @template TDeps - The type of the service's dependencies
 */
export type ServiceConstructor<T = unknown, TDeps extends ServiceDependencies = ServiceDependencies> =
    RequiredKeysOf<ResolveDepsBase<TDeps>> extends never
        ? (deps?: ResolveDeps<TDeps>) => T
        : (deps: ResolveDeps<TDeps>) => T;

/**
 * Represents a service in the dependency injection container.
 * A service is an injectable that:
 * - Can have dependencies
 * - Can implement interfaces
 * - Can have a specific scope
 * - Can use different resolution strategies
 *
 * @template T - The type that the service will resolve to
 * @template TDeps - The type of the service's dependencies
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface Service<T = unknown, TDeps extends ServiceDependencies = any> extends Injectable<T> {
    /**
     * Name of the service for debugging and identification.
     */
    readonly name: string;

    /**
     * Optional interface that this service implements.
     */
    readonly implements?: Interface;

    /**
     * Optional scope that controls the service's lifecycle and visibility.
     */
    readonly scope?: ContainerScope;

    /**
     * Dependencies required by this service.
     */
    readonly deps: IfAny<TDeps, ServiceDependencies, TDeps>;

    /**
     * Function that creates a new service instance with resolved dependencies.
     * @param deps - The resolved dependencies for the service
     * @returns The initialized service instance
     */
    readonly create: ServiceConstructor<T, TDeps>;
}

/**
 * Represents a mapping of service dependencies.
 * Each key is a dependency name and its value is an injectable that provides the dependency.
 */
export type ServiceDependencies = {
    [key: string]: Injectable;
};

/**
 * Configuration options for defining a service.
 *
 * @template T - The type that the service will resolve to
 * @template TExtend - The extended type that the service will resolve to (for inheritance)
 * @template TDeps - The type of the service's dependencies
 */
export interface ServiceOptions<
    T = unknown,
    TExtend extends T = T,
    TDeps extends ServiceDependencies = ServiceDependencies,
> {
    /**
     * Optional name of the service for debugging and identification.
     */
    readonly name?: string;
    /**
     * Optional interface that this service implements.
     */
    readonly implements?: Interface<T>;
    /**
     * Optional dependencies required by this service.
     */
    readonly deps?: TDeps;
    /**
     * Optional resolution strategy for the service.
     * Controls how the service instance is created and cached.
     */
    readonly resolution?: ServiceResolutionStrategy | ServiceResolutionType;
    /**
     * Optional scope that controls the service's lifecycle and visibility.
     */
    readonly scope?: ContainerScope;
    /**
     * Function that initializes the service with its dependencies.
     */
    readonly setup: ServiceSetup<TDeps, TExtend>;
}

/**
 * Function that initializes a service with its resolved dependencies.
 *
 * @template TService - The type that the service will resolve to
 * @template TDeps - The type of the service's dependencies
 */
export interface ServiceSetup<TDeps extends ServiceDependencies, TService> {
    /**
     * Creates a new service instance with the provided dependencies.
     * @param deps - The resolved dependencies for the service
     * @returns The initialized service instance
     */
    (deps: ResolveDeps<TDeps>): TService;
}

type ResolveDepsBase<D extends ServiceDependencies> = PartialOnUndefined<{
    readonly [K in keyof D]: D[K] extends Injectable<infer T> ? T : unknown;
}>;

/**
 * Creates a new service with the specified options.
 *
 * @template T - The type that the service will resolve to
 * @template TExtend - The extended type that the service will resolve to (for inheritance)
 * @template TDeps - The type of the service's dependencies
 * @param options - Configuration options for the service
 * @returns A new service instance
 * @__NO_SIDE_EFFECTS__
 */
export function defineService<T, TExtend extends T = T, TDeps extends ServiceDependencies = SomeObject>(
    options: ServiceOptions<T, TExtend, TDeps>,
): Service<TExtend, TDeps> {
    const name = options.name ?? options.implements?.name ?? 'UnnamedService';
    const resolution = getResolutionStrategy(options.resolution ?? 'singleton');

    const service: Service = {
        [INJECTABLE_SYMBOL]: SERVICE_SYMBOL,
        name,
        implements: options.implements as Interface,
        scope: options.scope,
        deps: options.deps ?? {},
        resolve: (container, caller) => resolution(service, container, caller),
        create: options.setup,
    };

    return service as Service<TExtend, TDeps>;
}

/**
 * Type guard to check if a value is a Service instance.
 * @template T - The type that the service resolves to
 * @param value - The value to check
 * @returns True if the value is a Service, false otherwise
 */
export function isService<T>(value: Injectable<T>): value is Service<T>;
/**
 * Type guard to check if a value is a Service instance.
 * @param value - The value to check
 * @returns True if the value is a Service, false otherwise
 */
export function isService(value: unknown): value is Service;
/**
 * Type guard to check if a value is a Service instance.
 * @param value - The value to check
 * @returns True if the value is a Service, false otherwise
 */
export function isService(value: unknown) {
    return value != null && (value as Injectable)[INJECTABLE_SYMBOL] === SERVICE_SYMBOL;
}
