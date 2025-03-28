import * as path from 'node:path';

import chalk from 'chalk';
import { consola } from 'consola';
import { config as configDotenv } from 'dotenv';

import { asArray } from '@nzyme/utils';

import { getProject } from './getProject.js';

type EnvVariablesOptions = {
    env?: string | string[];
    cwd?: string;
};

export function loadEnvVariables(options: EnvVariablesOptions = {}) {
    const project = getProject(options);
    const envFile = path.join(project.rootPath, '.env');
    const envVariables: Record<string, string> = {};

    loadEnvFile(envFile, envVariables);

    if (options.env) {
        for (const envName of asArray(options.env)) {
            loadEnvFile(`${envFile}.${envName}`, envVariables);
        }
    }

    return envVariables;
}

function loadEnvFile(file: string, output: Record<string, string>) {
    consola.info(`Loading environment variables from ${chalk.green(file)}`);
    const result = configDotenv({ path: file, override: true });
    Object.assign(output, result.parsed);
}
