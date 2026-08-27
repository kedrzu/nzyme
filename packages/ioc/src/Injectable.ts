import type { Container } from './Container.js';
import type { Dependencies } from './Service.js';

/**
 * Symbol for identifying injectables.
 * @internal
 */
export const INJECTABLE_SYMBOL = Symbol('injectable');

/**
 * Represents a type that can be injected into other types through the dependency injection container.
 * @template T - The type that this injectable will resolve to
 */
export interface Injectable<T = unknown> extends InjectableOptions<T> {
    /**
     * Symbol that indicates that the type is an injectable.
     * @internal
     */
    readonly [INJECTABLE_SYMBOL]: symbol | true;
}

/**
 * Options for configuring an injectable.
 * @template T - The type that the injectable will resolve to
 */
export interface InjectableOptions<T> {
    /**
     * Optional name of the injectable for debugging and identification purposes.
     */
    readonly name?: string;
    /**
     * Injectable dependencies for static dependency resolution.
     */
    readonly deps?: Dependencies;
    /**
     * Function that resolves the injectable to its concrete instance.
     * @param container - The container used for dependency resolution
     * @param caller - Optional injectable that requested this resolution
     * @returns The resolved instance of type T
     */
    readonly resolve: InjectableResolve<T>;
}

/**
 * Represents a function that resolves an injectable to its concrete instance.
 */
export interface InjectableResolve<T = unknown> {
    (container: Container, caller?: Injectable): T;
}

/**
 * Infers the type of the injectable by extracting the return type of its resolve function.
 * @template T - The type of the injectable
 */
export type Resolved<T> = T extends Injectable ? ReturnType<T['resolve']> : never;

/**
 * Creates a new injectable with the specified options.
 * @template T - The type that the injectable will resolve to
 * @param options - Configuration options for the injectable
 * @returns A new injectable instance
 */
export function defineInjectable<T>(options: InjectableOptions<T>): Injectable<T>;
/**
 * Creates a new injectable with the specified options.
 * @template T - The type that the injectable will resolve to
 * @param options - Configuration options for the injectable
 * @returns A new injectable instance
 */
export function defineInjectable<T, TOpts extends InjectableOptions<T>>(options: TOpts): Injectable<T> & TOpts;
/**
 * Creates a new injectable with the specified resolve function.
 * @template T - The type that the injectable will resolve to
 * @param resolve - Function that resolves the injectable to its concrete instance
 * @returns A new injectable instance
 */
export function defineInjectable<T>(resolve: InjectableResolve<T>): Injectable<T>;
/**
 * Creates a new injectable with the specified options.
 * @template T - The type that the injectable will resolve to
 * @param options - Configuration options for the injectable
 * @returns A new injectable instance
 */
export function defineInjectable<T extends Injectable>(
    options: InjectableOptions<unknown> & Omit<T, typeof INJECTABLE_SYMBOL>,
): T;
/**
 * @__NO_SIDE_EFFECTS__
 */
export function defineInjectable(optionsOrResolve: InjectableOptions<unknown> | InjectableResolve): Injectable {
    if (typeof optionsOrResolve === 'function') {
        return {
            resolve: optionsOrResolve,
            [INJECTABLE_SYMBOL]: true,
        };
    }

    return {
        ...optionsOrResolve,
        [INJECTABLE_SYMBOL]: true,
    };
}

/**
 * Type guard to check if a value is an injectable.
 * @param value - The value to check
 * @returns True if the value is an injectable, false otherwise
 */
export function isInjectable(value: unknown): value is Injectable {
    if (value == null) {
        return false;
    }

    return (value as Injectable)[INJECTABLE_SYMBOL] !== undefined;
}
