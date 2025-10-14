import { defineInterface } from '../Interface.js';

/**
 * Represents the environment variables.
 */
export type EnvVariables = {
    [key: string]: string | undefined;
};

/**
 * The environment variables interface.
 */
export const EnvVariables = defineInterface<EnvVariables>({
    name: 'EnvVariables',
    default: () => process.env,
});
