import { existsSync } from 'fs';
import * as path from 'node:path';

import chalk from 'chalk';
import { consola } from 'consola';
import { config as configDotenv } from 'dotenv';

import { asArray } from '@nzyme/utils';

import { getProjectRoot } from './getProjectRoot.js';

/**
 * Options for loading environment variables.
 */
export type EnvVariablesOptions = {
    /**
     * The working directory to load the environment file from.
     */
    cwd?: string;
    /**
     * The environment to load files for.
     * When provided, it will load files with the `.env.<env>` format.
     */
    env?: string | string[];
};

/**
 * Load environment variables from a .env file.
 */
export function loadEnvVariables(options: EnvVariablesOptions = {}) {
    const cwd = options.cwd ?? process.cwd();
    const root = getProjectRoot({ cwd });

    const envVariables: Record<string, string> = {};

    // Load environment variables from the project root.
    loadEnvFilesInDir(root, options.env, envVariables);

    if (cwd !== root) {
        // Load environment variables from the current working directory.
        loadEnvFilesInDir(cwd, options.env, envVariables);
    }

    return envVariables;
}

function loadEnvFilesInDir(
    dir: string,
    env: string | string[] | undefined,
    output: Record<string, string>,
) {
    const envFile = path.join(dir, '.env');

    loadEnvFile(envFile, output);

    if (env) {
        for (const envName of asArray(env)) {
            loadEnvFile(`${envFile}.${envName}`, output);
        }
    }
}

function loadEnvFile(file: string, output: Record<string, string>) {
    if (!existsSync(file)) {
        return;
    }

    const result = configDotenv({ path: file, override: true });
    if (result.parsed) {
        consola.info(`Loaded environment variables from ${chalk.green(file)}`);
        Object.assign(output, result.parsed);
    }
}
