import type { Container } from './Container.js';

/**
 * Symbol for identifying injectables.
 * @internal
 */
export const INJECTABLE_SYMBOL = Symbol('injectable');

/**
 * Represents a type that can be injected into other types through the dependency injection container.
 * @template T - The type that this injectable will resolve to
 */
export type Injectable<T = unknown> = {
    /**
     * Symbol that indicates that the type is an injectable.
     * @internal
     */
    readonly [INJECTABLE_SYMBOL]: symbol | true;
    /**
     * Optional name of the injectable for debugging and identification purposes.
     */
    readonly name?: string;
    /**
     * Function that resolves the injectable to its concrete instance.
     * @param container - The container used for dependency resolution
     * @param caller - Optional injectable that requested this resolution
     * @returns The resolved instance of type T
     */
    readonly resolve: InjectableResolve<T>;
};

/**
 * Options for configuring an injectable.
 * @template T - The type that the injectable will resolve to
 */
export type InjectableOptions<T> = {
    /**
     * Optional name of the injectable for debugging and identification purposes.
     */
    readonly name?: string;
    /**
     * Function that resolves the injectable to its concrete instance.
     * @param container - The container used for dependency resolution
     * @param caller - Optional injectable that requested this resolution
     * @returns The resolved instance of type T
     */
    readonly resolve: (container: Container, caller?: Injectable) => T;
};

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
export type Injected<T> = T extends Injectable ? ReturnType<T['resolve']> : never;

/**
 * Creates a new injectable with the specified options.
 * @template T - The type that the injectable will resolve to
 * @param options - Configuration options for the injectable
 * @returns A new injectable instance
 */
// #__NO_SIDE_EFFECTS__
export function defineInjectable<T>(options: InjectableOptions<T>): Injectable<T> {
    return {
        ...options,
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
