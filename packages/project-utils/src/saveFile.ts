import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { outputFile, pathExists } from 'fs-extra';
import { format } from 'oxfmt';
import type { FormatConfig } from 'oxfmt';

import { getProjectRoot } from './getProjectRoot.js';

let oxfmtConfig: FormatConfig | undefined;

/**
 * Save a file with oxfmt formatting.
 *
 * Generated output is no longer passed through a linter's autofix: oxlint has no programmatic
 * lint-text API, and silently autofixing generated code would only hide a problem that belongs in
 * the generator. Anything a generator emits is linted like the rest of the repo.
 */
export async function saveFile(path: string, content: string): Promise<void> {
    try {
        const result = await format(path, content, getOxfmtConfig());
        content = result.code;
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
 * Load oxfmt formatting config from the project's .oxfmtrc.json.
 * The programmatic format() API doesn't auto-discover config files,
 * so we load and cache it manually.
 */
function getOxfmtConfig(): FormatConfig {
    if (oxfmtConfig) {
        return oxfmtConfig;
    }

    try {
        const configPath = resolve(getProjectRoot(), '.oxfmtrc.json');
        const raw = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
        const { ignorePatterns: _, overrides: __, ...config } = raw;
        oxfmtConfig = config;
    } catch {
        oxfmtConfig = {};
    }

    return oxfmtConfig;
}
