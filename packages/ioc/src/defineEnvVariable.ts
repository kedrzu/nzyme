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
export interface EnvVariable<TName extends string = string> extends Injectable<string> {
    /**
     * Name of the environment variable.
     */
    name: TName;
}

/**
 *
 */
export function defineEnvVariable<TName extends string = string>(name: TName): EnvVariable<TName> {
    return defineInjectable<EnvVariable<TName>>({
        name,
        deps: DEPS,
        resolve,
    });
}

function resolve(this: EnvVariable, container: Container) {
    const name = this.name;
    const env = container.resolve(EnvVariables);
    const value = env[name];

    if (!value) {
        throw new Error(`Environment variable ${name} is not set`);
    }
    return value;
}
