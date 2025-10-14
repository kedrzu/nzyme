import { outputFile } from 'fs-extra';

import { getEnvFilePath } from './getEnvFilePath.js';
import type { EnvFilePathOptions } from './getEnvFilePath.js';
import { readEnvVariables } from './readEnvVariables.js';

/**
 *
 */
export interface SaveEnvVariablesOptions extends EnvFilePathOptions {
    /**
     * The environment variables to save.
     */
    env: Record<string, unknown>;
    /**
     * Whether to replace all existing variables.
     * If false, only new variables will be added.
     * @default false
     */
    replace?: boolean;
}

/**
 * Saves environment variables to a file.
 */
export async function saveEnvVariables(options: SaveEnvVariablesOptions) {
    const env = await getEnvVariablesToSave(options);

    let envContent = '';
    for (const key of Object.keys(env).sort()) {
        let value: string;
        if (env[key] == null) {
            value = '';
        } else {
            value = JSON.stringify(env[key]);
        }

        envContent += `${key}=${value}\n`;
    }

    const filePath = getEnvFilePath(options);
    await outputFile(filePath, envContent);
}

async function getEnvVariablesToSave(options: SaveEnvVariablesOptions) {
    if (options.replace) {
        return options.env;
    }

    const env = (await readEnvVariables(options)) as Record<string, unknown>;
    return Object.assign(env, options.env);
}
