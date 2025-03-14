import { INJECTABLE_SYMBOL, isInjectable, type Injectable } from './Injectable.js';

const INTERFACE_SYMBOL = Symbol('interface');

/**
 * Options for the interface.
 */
export interface InterfaceOptions<T = unknown> {
    /**
     * Name of the interface.
     */
    name?: string;
    /**
     * Default value for the interface.
     */
    default?: Injectable<T>;
}

/**
 * Interface injectable.
 */
export type Interface<T = unknown> = Injectable<T> & {
    /**
     * Make the interface optional.
     * Will resolve to `undefined` if the interface is not registered in the container.
     */
    optional(): Injectable<T | undefined>;
    /**
     * Set the default value for the interface.
     * Will resolve to the default value if the interface is not registered in the container.
     * @param value - Default value.
     */
    default(value: T): Injectable<T>;
    /**
     * Set the default value for the interface.
     * Will resolve to the default value if the interface is not registered in the container.
     * @param value - Default value.
     */
    default<D>(value: D): Injectable<T | D>;
    /**
     * Set the default value for the interface.
     * Will resolve to the default value if the interface is not registered in the container.
     * @param value - Default value.
     */
    default<D>(injectable: Injectable<D>): Injectable<T | D>;
};

/**
 * Define an interface injectable.
 * @param options - Options for the interface.
 * @returns Interface injectable.
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
                return options.default.resolve(container, caller);
            }

            throw new Error(`Interface ${this.name ?? ''} was not found`);
        },
        optional,
        default: defaultValue,
    };
}

/**
 * Check if the value is an interface injectable.
 * @param value - Value to check.
 * @returns True if the value is an interface, false otherwise.
 */
export function isInterface(value: unknown): value is Interface {
    if (value == null) {
        return false;
    }

    return (value as Interface)[INJECTABLE_SYMBOL] === INTERFACE_SYMBOL;
}

function optional<T>(this: Interface<T>): Injectable<T | undefined> {
    return this.default(undefined);
}

function defaultValue<T, D>(
    this: Interface<T>,
    defaultValue: D | Injectable<D>,
): Injectable<T | D> {
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
