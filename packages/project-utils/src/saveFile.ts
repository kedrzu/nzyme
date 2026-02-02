import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { dirname, join } from 'path';

import { ESLint } from 'eslint';
import { outputFile, pathExists } from 'fs-extra';
import { format, resolveConfig } from 'prettier';

import { getProjectRoot } from './getProjectRoot.js';

// Cache ESLint instances by config file path
const eslintCache = new Map<string, ESLint>();

// ESLint config file names (flat config)
const ESLINT_CONFIG_FILES = [
    'eslint.config.js',
    'eslint.config.mjs',
    'eslint.config.cjs',
    'eslint.config.ts',
    'eslint.config.mts',
    'eslint.config.cts',
];

/**
 * Save a file with ESLint fixes and prettier formatting.
 */
export async function saveFile(path: string, content: string): Promise<void> {
    // Run ESLint first to fix code issues
    try {
        const eslint = getEslintInstance(path);

        if (eslint) {
            const results = await eslint.lintText(content, { filePath: path });
            if (results.length > 0 && results[0] && results[0].output !== undefined) {
                content = results[0].output;
            }
        }
    } catch (error) {
        console.error(`Failed to lint ${path}`, error);
    }

    // Then run Prettier for formatting
    const config = await resolveConfig(path);

    try {
        content = await format(content, { ...config, filepath: path });
    } catch (error) {
        console.error(`Failed to format ${path}`, error);
    }

    // Check if file exists and compare content to avoid unnecessary writes
    if (await pathExists(path)) {
        const existingContent = await readFile(path, 'utf8');
        if (existingContent === content) {
            // Content hasn't changed, skip writing
            return;
        }
    }

    await outputFile(path, content, { encoding: 'utf8' });
}

/**
 * Find the nearest ESLint config file for a given file path.
 * Returns the config file path or undefined if not found.
 */
function findEslintConfigPath(filePath: string): string | undefined {
    const projectRoot = getProjectRoot();
    let dir = dirname(filePath);

    while (dir.length >= projectRoot.length) {
        for (const configFile of ESLINT_CONFIG_FILES) {
            const configPath = join(dir, configFile);
            if (existsSync(configPath)) {
                return configPath;
            }
        }

        const parent = dirname(dir);
        if (parent === dir) {
            break;
        }
        dir = parent;
    }

    return undefined;
}

/**
 * Get or create an ESLint instance for the given file.
 * Caches instances by their config file location.
 */
function getEslintInstance(filePath: string): ESLint | undefined {
    const configPath = findEslintConfigPath(filePath);
    if (!configPath) {
        return undefined;
    }

    const cached = eslintCache.get(configPath);
    if (cached) {
        return cached;
    }

    const configDir = dirname(configPath);
    const eslint = new ESLint({
        cwd: configDir,
        fix: true,
    });

    eslintCache.set(configPath, eslint);
    return eslint;
}
