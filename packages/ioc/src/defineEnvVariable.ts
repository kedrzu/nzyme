import type { Container } from './Container.js';
import { EnvVariables } from './helpers/EnvVariables.js';
import { defineInjectable } from './Injectable.js';
import type { Injectable } from './Injectable.js';

const DEPS = {
    env: EnvVariables,
};

/**
 *
 */
export type EnvVariableValue<TRequired extends boolean = false, TValue = string> = TRequired extends true
    ? TValue
    : TValue | undefined;

/**
 * Options for the env variable.
 */
export interface EnvVariableOptionsRequired<TRequired extends boolean> {
    /**
     * Whether the environment variable is required.
     */
    required?: TRequired;
}

/**
 * Options for the env variable.
 */
export interface EnvVariableOptionsParse<TRequired extends boolean, TValue = string>
    extends EnvVariableOptionsRequired<TRequired> {
    /**
     * Function to parse the environment variable value.
     */
    parse?: (value: EnvVariableValue<TRequired>) => TValue;
}

/**
 * Options for the env variable.
 */
export interface EnvVariableOptionsDefault<TValue = string> extends EnvVariableOptionsParse<false, TValue> {
    /**
     * Default value of the environment variable.
     */
    default: (() => TValue) | TValue;
}

/**
 *
 */
export interface EnvVariable<TName extends string = string, TRequired extends boolean = boolean, TValue = unknown>
    extends EnvVariableOptionsParse<TRequired, TValue>,
        Injectable<TValue> {
    /**
     * Whether the environment variable is required.
     */
    required: TRequired;

    /**
     * Name of the environment variable.
     */
    name: TName;

    /**
     * Default value of the environment variable.
     */
    default?: () => TValue;
}

/**
 * Define an environment variable injectable.
 * @param name - Name of the environment variable.
 * @param options - Options for the environment variable.
 * @returns Environment variable injectable.
 * @__NO_SIDE_EFFECTS__
 */
export function defineEnvVariable<TName extends string = string, TRequired extends boolean = true>(
    name: TName,
    options?: EnvVariableOptionsRequired<TRequired> & { default?: never; parse?: never },
): EnvVariable<TName, TRequired, string>;
/**
 * Define an environment variable injectable.
 * @param name - Name of the environment variable.
 * @param options - Options for the environment variable.
 * @returns Environment variable injectable.
 * @__NO_SIDE_EFFECTS__
 */
export function defineEnvVariable<TName extends string = string, TRequired extends boolean = true, TValue = string>(
    name: TName,
    options?: EnvVariableOptionsParse<TRequired, TValue> & { default?: never },
): EnvVariable<TName, TRequired, TValue>;
/**
 * Define an environment variable injectable.
 * @param name - Name of the environment variable.
 * @param options - Options for the environment variable.
 * @returns Environment variable injectable.
 * @__NO_SIDE_EFFECTS__
 */
export function defineEnvVariable<TName extends string = string, TValue = string>(
    name: TName,
    options?: EnvVariableOptionsDefault<TValue>,
): EnvVariable<TName, false, TValue>;
/**
 *
 */
export function defineEnvVariable(
    name: string,
    options?: (EnvVariableOptionsParse<boolean, unknown> & { default?: never }) | EnvVariableOptionsDefault<unknown>,
) {
    const defaultValue = options?.default as EnvVariableOptionsDefault['default'];

    return defineInjectable<EnvVariable<string, boolean, unknown>>({
        name,
        deps: DEPS,
        required: options?.required ?? (defaultValue ? false : true),
        parse: options?.parse,
        resolve,
        default: defaultValue ? (typeof defaultValue === 'function' ? defaultValue : () => defaultValue) : undefined,
    });
}

function resolve(this: EnvVariable, container: Container, caller?: Injectable) {
    const name = this.name;
    const env = container.resolve(EnvVariables);
    const value = env[name];

    if (!value) {
        if (this.default) {
            return this.default();
        }

        if (this.required) {
            throw new Error(`Environment variable ${name} is not set. Caller: ${caller?.name}`);
        }
    }

    if (this.parse) {
        return this.parse(value);
    }

    return value;
}
