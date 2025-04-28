import { defineInjectable } from '../Injectable.js';
import { EnvVariables } from './EnvVariables.js';

/**
 * Options for {@link envVariable}.
 */
export type EnvVariableOptions<TRequired extends boolean> = {
    /**
     * Whether the environment variable is required.
     */
    required?: TRequired;
};

/**
 * Define an environment variable injectable.
 * @param name - Name of the environment variable.
 * @param options - Options for the environment variable.
 * @returns Environment variable injectable.
 */
export function envVariable<TRequired extends boolean = false>(
    name: string,
    options?: EnvVariableOptions<TRequired>,
) {
    type Result = TRequired extends true ? string : string | undefined;

    const required = options?.required ?? false;

    return defineInjectable<Result>({
        name: `env:${name}`,
        resolve: container => {
            const env = container.resolve(EnvVariables);
            const value = env[name];

            if (required && !value) {
                throw new Error(`Environment variable ${name} not set`);
            }

            return value as Result;
        },
    });
}
