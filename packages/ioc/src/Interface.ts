import type { Injectable, InjectableResolve } from './Injectable.js';
import { INJECTABLE_SYMBOL, isInjectable } from './Injectable.js';

/**
 * Symbol used to identify interface instances.
 * @internal
 */
const INTERFACE_SYMBOL = Symbol('interface');

/**
 * Represents an interface that can be injected into services.
 * Interfaces provide a way to:
 * - Define abstract dependencies
 * - Support optional dependencies
 * - Provide default implementations
 * - Enable hierarchical resolution through container parents
 *
 * @template T - The type that the interface will resolve to
 */
export type Interface<T = unknown> = Injectable<T> & {
    /**
     * Sets a default value for the interface.
     * The default value will be used when the interface is not found in the container.
     * @param value - The default value to use
     * @returns A new injectable that resolves to T
     */
    default(value: T): Injectable<T>;
    /**
     * Sets a default value of a different type for the interface.
     * The default value will be used when the interface is not found in the container.
     * @template D - The type of the default value
     * @param value - The default value to use
     * @returns A new injectable that resolves to T | D
     */
    default<D>(value: D): Injectable<D | T>;
    /**
     * Sets a default injectable for the interface.
     * The default injectable will be resolved when the interface is not found in the container.
     * @template D - The type that the default injectable resolves to
     * @param injectable - The default injectable to use
     * @returns A new injectable that resolves to T | D
     */
    default<D>(injectable: Injectable<D>): Injectable<D | T>;
    /**
     * Makes the interface optional, allowing it to resolve to undefined if not found.
     * @returns A new injectable that resolves to T | undefined
     */
    optional(): Injectable<T | undefined>;
};

/**
 * Configuration options for defining an interface.
 * @template T - The type that the interface will resolve to
 */
export interface InterfaceOptions<T = unknown> {
    /**
     * Optional name of the interface for debugging and identification.
     */
    name?: string;
    /**
     * Optional default injectable to use when the interface is not found in the container.
     */
    default?: Injectable<T> | InjectableResolve<T>;
}

/**
 * Creates a new interface with the specified options.
 * Interfaces support hierarchical resolution through container parents and optional defaults.
 *
 * @template T - The type that the interface will resolve to
 * @param options - Configuration options for the interface
 * @returns A new interface instance
 * @__NO_SIDE_EFFECTS__
 */
export function defineInterface<T>(options: InterfaceOptions<T> = {}): Interface<T> {
    return {
        [INJECTABLE_SYMBOL]: INTERFACE_SYMBOL,
        name: options.name,
        resolve(container, caller) {
            while (container) {
                const value = container.get(this);

                if (value === undefined) {
                    if (container.parent) {
                        container = container.parent;
                        continue;
                    }

                    break;
                }

                if (isInjectable(value)) {
                    return value.resolve(container, caller);
                }

                return value;
            }

            if (options.default) {
                if (isInjectable(options.default)) {
                    return options.default.resolve(container, caller);
                }

                return options.default(container, caller);
            }

            throw new Error(`Interface ${this.name ?? ''} was not found`);
        },
        optional,
        default: defaultValue,
    };
}

/**
 * Type guard to check if a value is an Interface instance.
 * @param value - The value to check
 * @returns True if the value is an Interface, false otherwise
 */
export function isInterface(value: unknown): value is Interface {
    if (value == null) {
        return false;
    }

    return (value as Interface)[INJECTABLE_SYMBOL] === INTERFACE_SYMBOL;
}

/**
 * Sets a default value for an interface.
 * The default value will be used when the interface is not found in the container.
 *
 * @template T - The type that the interface resolves to
 * @template D - The type of the default value
 * @param defaultValue - The default value or injectable to use
 * @returns A new injectable that resolves to T | D
 */
function defaultValue<T, D>(
    this: Interface<T>,
    defaultValue: D | Injectable<D>,
): Injectable<D | T> {
    return {
        [INJECTABLE_SYMBOL]: true,
        name: this.name,
        resolve: (container, caller) => {
            const value = container.get(this);
            if (value === undefined) {
                if (isInjectable(defaultValue)) {
                    return defaultValue.resolve(container, caller);
                }

                return defaultValue;
            }

            if (isInjectable(value)) {
                return value.resolve(container, caller);
            }

            return value;
        },
    };
}

/**
 * Makes an interface optional, allowing it to resolve to undefined if not found.
 * @template T - The type that the interface resolves to
 * @returns A new injectable that resolves to T | undefined
 */
function optional<T>(this: Interface<T>): Injectable<T | undefined> {
    return this.default(undefined);
}
