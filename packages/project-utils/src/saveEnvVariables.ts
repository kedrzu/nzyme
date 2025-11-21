import { outputFile } from 'fs-extra';

import { getEnvFilePath } from './getEnvFilePath.js';
import type { EnvFilePathOptions } from './getEnvFilePath.js';
import { readEnvVariables } from './readEnvVariables.js';

/**
 * Options for saving environment variables to a file.
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
        const value = escapeEnvValue(env[key]);
        envContent += `${key}=${value}\n`;
    }

    const filePath = getEnvFilePath(options);
    await outputFile(filePath, envContent);
}

/**
 * Escapes a value for use in a .env file following dotenv conventions.
 * - Empty/null values are written as empty strings
 * - Simple values without special characters are written as-is
 * - Values with spaces or special characters are wrapped in single quotes (no escaping needed inside)
 * - Values with single quotes use double quotes with proper escaping
 *
 * @__NO_SIDE_EFFECTS__
 */
function escapeEnvValue(value: unknown): string {
    if (value == null) {
        return '';
    }

    // Convert to string - keep objects/arrays as JSON
    const str = typeof value === 'string' ? value : JSON.stringify(value);

    // Empty string - return without quotes
    if (str.length === 0) {
        return '';
    }

    // Check if value is safe to write unquoted
    // Safe: alphanumeric, underscore, dash, dot, comma, colon (basic values)
    // Unsafe: spaces, quotes, special shell characters, line breaks, etc.
    const isSafe = /^[a-zA-Z0-9_.,:/-]+$/.test(str);

    if (isSafe) {
        return str;
    }

    // If value contains single quotes, use double quotes with escaping
    if (str.includes("'")) {
        // Escape backslashes and double quotes, then wrap in double quotes
        const escaped = str
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t');
        return `"${escaped}"`;
    }

    // Otherwise use single quotes (no escaping needed, except for single quotes)
    // Single quotes in dotenv preserve everything literally except single quotes
    return `'${str}'`;
}

async function getEnvVariablesToSave(options: SaveEnvVariablesOptions) {
    if (options.replace) {
        return options.env;
    }

    const env = (await readEnvVariables(options)) as Record<string, unknown>;
    return Object.assign(env, options.env);
}
