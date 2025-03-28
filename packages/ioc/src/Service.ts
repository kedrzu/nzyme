import type { EmptyObject, PartialOnUndefined, Writable } from '@nzyme/types';

import type { ContainerScope } from './ContainerScope.js';
import { INJECTABLE_SYMBOL, type Injectable } from './Injectable.js';
import type { Interface } from './Interface.js';
import {
    type ServiceResolutionStrategy,
    type ServiceResolutionType,
    getResolutionStrategy,
} from './serviceResolve.js';
const SERVICE_SYMBOL = Symbol('service');

/**
 *
 */
export type ServiceDependencies = {
    [key: string]: Injectable;
};

/**
 *
 */
export type ResolveDependencies<D extends ServiceDependencies> = keyof D extends never
    ? void
    : PartialOnUndefined<{
          [K in keyof D]: D[K] extends Injectable<infer T> ? T : unknown;
      }>;

/**
 *
 */
export interface ServiceOptions<
    T = unknown,
    TExtend extends T = T,
    TDeps extends ServiceDependencies = ServiceDependencies,
> {
    /**
     * Name of the service.
     */
    readonly name?: string;
    /**
     * Interface implemented by the service.
     */
    readonly implements?: Interface<T>;
    /**
     * Dependencies of the service.
     */
    readonly deps?: TDeps;
    /**
     * Resolution strategy of the service.
     */
    readonly resolution?: ServiceResolutionType | ServiceResolutionStrategy;
    /**
     * Scope of the service.
     */
    readonly scope?: ContainerScope;
    /**
     * Setup function of the service.
     */
    readonly setup: (deps: ResolveDependencies<TDeps>) => TExtend;
}

/**
 *
 */
export type ServiceConstructor<
    T = unknown,
    TDeps extends ServiceDependencies = ServiceDependencies,
> =
    EmptyObject extends ResolveDependencies<TDeps>
        ? (deps?: ResolveDependencies<TDeps>) => T
        : (deps: ResolveDependencies<TDeps>) => T;

export type Service<
    T = unknown,
    TDeps extends ServiceDependencies = ServiceDependencies,
> = ServiceConstructor<T, TDeps> &
    Injectable<T> & {
        readonly implements?: Interface;
        readonly scope?: ContainerScope;
        readonly deps: TDeps;
    };

/**
 * Define a service.
 * #__NO_SIDE_EFFECTS__
 */
export function defineService<
    T,
    TExtend extends T = T,
    TDeps extends ServiceDependencies = EmptyObject,
>(options: ServiceOptions<T, TExtend, TDeps>): Service<TExtend, TDeps> {
    const name = options.name ?? options.implements?.name ?? 'UnnamedService';
    const resolution = getResolutionStrategy(options.resolution ?? 'singleton');

    const wrapper: { [key: string]: ServiceConstructor } = {
        [name](deps: object | undefined) {
            return options.setup((deps ?? {}) as ResolveDependencies<TDeps>);
        },
    };

    const service = wrapper[name] as unknown as Writable<Service>;

    service[INJECTABLE_SYMBOL] = SERVICE_SYMBOL;
    service.implements = options.implements as Interface;
    service.scope = options.scope;
    service.deps = options.deps ?? ({} as TDeps);
    service.resolve = (container, caller) =>
        resolution({
            service: service as unknown as Service,
            options: options as unknown as ServiceOptions,
            container,
            caller,
        }) as TExtend;

    return service as unknown as Service<TExtend, TDeps>;
}

/**
 * Check if a value is a service.
 * #__NO_SIDE_EFFECTS__
 */
export function isService<T>(value: Injectable<T>): value is Service<T>;
/**
 * Check if a value is a service.
 */
export function isService(value: unknown): value is Service;
/**
 * Check if a value is a service.
 */
export function isService(value: unknown) {
    return value != null && (value as Injectable)[INJECTABLE_SYMBOL] === SERVICE_SYMBOL;
}
