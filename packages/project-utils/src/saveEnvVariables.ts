import * as fs from 'fs/promises';
import * as path from 'path';

import { parse } from 'dotenv';
import { outputFile, pathExists } from 'fs-extra';

import { getProjectRoot } from './getProjectRoot.js';

interface SaveEnvVariablesOptions {
    env: Record<string, unknown>;
    cwd?: string;
    file?: string;
    root?: boolean;
}

interface ReadEnvVariablesOptions {
    cwd?: string;
    file?: string;
    root?: boolean;
}

/**
 * Saves environment variables to a file.
 */
export async function saveEnvVariables(options: SaveEnvVariablesOptions) {
    const env = (await readEnvVariables(options)) as Record<string, unknown>;

    for (const [key, value] of Object.entries(options.env)) {
        env[key] = value;
    }

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

    const filePath = getFilePath(options);
    await outputFile(filePath, envContent);
}

/**
 * Reads environment variables from a file.
 */
export async function readEnvVariables(options: ReadEnvVariablesOptions): Promise<Record<string, string>> {
    const filePath = getFilePath(options);

    if (await pathExists(filePath)) {
        const fileContent = await fs.readFile(filePath, 'utf8');
        return parse(fileContent);
    }

    return {};
}

function getFilePath(options: ReadEnvVariablesOptions) {
    const cwd = options.root ? getProjectRoot(options) : (options.cwd ?? process.cwd());
    const fileName = options.file ?? '.env';
    return path.join(cwd, fileName);
}
