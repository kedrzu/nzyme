import type { Container } from './Container.js';

/**
 * Represents a module that can be registered with a container.
 * A module is a function that:
 * - Receives a container instance for dependency injection
 * - Can accept optional parameters during initialization
 * - Can return a result that will be available after initialization
 *
 * @template TParams - Type of the parameters that the module accepts
 * @template TResult - Type of the result that the module returns
 */
export type Module<TParams extends unknown[] = [], TResult = void> = {
    /**
     * Initializes the module with the container and optional parameters.
     * @param container - The container instance for dependency injection
     * @param params - Optional parameters for module initialization
     * @returns The module's initialization result
     */
    (container: Container, ...params: TParams): TResult;
};

/**
 * Creates a new module from a function.
 * This is a type-safe wrapper that ensures the function matches the Module interface.
 *
 * @template TParams - Type of the parameters that the module accepts
 * @template TResult - Type of the result that the module returns
 * @param module - The function to convert into a module
 * @returns The same function, properly typed as a Module
 * @__NO_SIDE_EFFECTS__
 */
export function defineModule<TParams extends unknown[], TResult>(module: Module<TParams, TResult>) {
    return module;
}
