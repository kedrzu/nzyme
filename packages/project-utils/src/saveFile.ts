import { readFile } from 'fs/promises';

import { ESLint } from 'eslint';
import { outputFile, pathExists } from 'fs-extra';
import { format, resolveConfig } from 'prettier';

import { getProjectRoot } from './getProjectRoot.js';

// Single ESLint instance for the entire project
let eslintInstance: ESLint | undefined;

/**
 * Save a file with ESLint fixes and prettier formatting.
 */
export async function saveFile(path: string, content: string): Promise<void> {
    // Run ESLint first to fix code issues
    try {
        const eslint = getEslintInstance();

        // ESLint resolves config based on filePath, not cwd
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
 * Get or create the single ESLint instance for the project.
 * Uses the project root as cwd, allowing ESLint to resolve configs per-file.
 */
function getEslintInstance(): ESLint {
    if (eslintInstance) {
        return eslintInstance;
    }

    eslintInstance = new ESLint({
        cwd: getProjectRoot(),
        fix: true,
    });

    return eslintInstance;
}
