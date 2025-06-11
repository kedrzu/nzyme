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
    options?: EnvVariableOptionsRequired<TRequired>,
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
    options?: EnvVariableOptionsParse<TRequired, TValue>,
): EnvVariable<TName, TRequired, TValue>;
/**
 *
 */
export function defineEnvVariable(name: string, options?: EnvVariableOptionsParse<boolean, unknown>) {
    return defineInjectable<EnvVariable<string, boolean, unknown>>({
        name,
        deps: DEPS,
        required: options?.required ?? true,
        parse: options?.parse,
        resolve,
    });
}

function resolve(this: EnvVariable, container: Container) {
    const name = this.name;
    const env = container.resolve(EnvVariables);
    const value = env[name];

    if (!value && this.required) {
        throw new Error(`Environment variable ${name} is not set`);
    }

    if (this.parse) {
        return this.parse(value);
    }

    return value;
}
