import { existsSync } from 'fs';
import * as path from 'node:path';

import chalk from 'chalk';
import { config as configDotenv } from 'dotenv';

import { asArray } from '@nzyme/utils/array/asArray.js';

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
    /**
     * The output object to assign the environment variables to.
     * @default process.env
     */
    output?: Record<string, string>;

    /**
     * If true, it will load environment variables from the project root.
     * @default true
     */
    root?: boolean;
};

/**
 * Load environment variables from a .env file.
 */
export function loadEnvVariables(options: EnvVariablesOptions = {}) {
    const cwd = options.cwd ?? process.cwd();
    const root = getProjectRoot(cwd);
    const output: Record<string, string> = options.output ?? (process.env as Record<string, string>);

    if (!options.root) {
        loadEnvFilesInDir(cwd, options.env, output);
        return;
    }

    // Load environment variables from the project root.
    loadEnvFilesInDir(root, options.env, output);

    if (cwd !== root) {
        // Load environment variables from the current working directory.
        loadEnvFilesInDir(cwd, options.env, output);
    }
}

function loadEnvFilesInDir(dir: string, env: string | string[] | undefined, output: Record<string, string>) {
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

    const result = configDotenv({ path: file, override: true, processEnv: output, quiet: true });
    if (result.parsed) {
        console.info(`🛠️ Loaded environment variables from ${chalk.green(file)}`);
    }
}
