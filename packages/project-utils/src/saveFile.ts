import { readFile } from 'fs/promises';

import { ESLint } from 'eslint';
import { outputFile, pathExists } from 'fs-extra';
import { format, resolveConfig } from 'prettier';

// Cache ESLint instances per working directory to avoid recreating them
const eslintCache = new Map<string, ESLint>();

/**
 * Save a file with ESLint fixes and prettier formatting.
 */
export async function saveFile(path: string, content: string): Promise<void> {
    // Run ESLint first to fix code issues
    try {
        const eslint = getESLintInstance();

        // Check if the file should be linted
        const isIgnored = await eslint.isPathIgnored(path);
        if (!isIgnored) {
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
 * Get or create a cached ESLint instance for the current working directory.
 * @__NO_SIDE_EFFECTS__
 */
function getESLintInstance(): ESLint {
    const cwd = process.cwd();

    if (!eslintCache.has(cwd)) {
        const eslint = new ESLint({
            cwd,
            fix: true,
            cache: true, // Enable ESLint's built-in caching
        });
        eslintCache.set(cwd, eslint);
    }

    return eslintCache.get(cwd)!;
}
