import { readFile } from 'fs/promises';
import { dirname, join } from 'path';

import { ESLint } from 'eslint';
import { outputFile, pathExists } from 'fs-extra';
import { format, resolveConfig } from 'prettier';

import { getProjectRoot } from './getProjectRoot.js';

// Cache ESLint instances per directory (maps any directory to its ESLint instance)
const eslintCache = new Map<string, ESLint>();

// Known ESLint config file names (flat config)
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
        const eslint = await findEslintInstance(dirname(path));

        // Check if the file should be linted
        const results = await eslint.lintText(content, { filePath: path });
        if (results.length > 0 && results[0] && results[0].output !== undefined) {
            content = results[0].output;
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
 * Find ESLint instance by searching upward for config file.
 * Caches the ESLint instance at each directory level for fast subsequent lookups.
 * @__NO_SIDE_EFFECTS__
 */
async function findEslintInstance(dir: string): Promise<ESLint> {
    // Check cache first
    const cached = eslintCache.get(dir);
    if (cached !== undefined) {
        return cached;
    }

    // Check if this directory has a config file
    for (const configFile of ESLINT_CONFIG_FILES) {
        const configPath = join(dir, configFile);
        if (await pathExists(configPath)) {
            const eslint = new ESLint({
                cwd: dir,
                overrideConfigFile: configPath,
                overrideConfig: {
                    languageOptions: {
                        parserOptions: {
                            tsconfigRootDir: dir,
                        },
                    },
                },
                fix: true,
                cache: true,
            });
            eslintCache.set(dir, eslint);
            return eslint;
        }
    }

    // Check if we've reached the project root
    const projectRoot = getProjectRoot(dir);
    if (projectRoot === dir) {
        // Fallback: create ESLint instance for this directory
        const eslint = new ESLint({
            cwd: dir,
            fix: true,
            cache: true,
        });
        eslintCache.set(dir, eslint);
        return eslint;
    }

    // Recursively search parent directory and cache the result
    const eslint = await findEslintInstance(dirname(dir));
    eslintCache.set(dir, eslint);
    return eslint;
}
