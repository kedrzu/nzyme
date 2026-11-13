import { readFileSync } from 'node:fs';

import type { RuntimeConfig } from './RuntimeConfig.js';

/** Options of {@link readConfigFile}. */
export interface ReadConfigFileOptions {
    /** Path of the JSON document. */
    path: string;

    /** Return undefined instead of throwing when the file is absent. */
    optional?: boolean;
}

/** Reads and parses a JSON config document. */
export function readConfigFile(options: ReadConfigFileOptions & { optional?: false }): RuntimeConfig;
/** Reads and parses a JSON config document if the file exists. */
export function readConfigFile(options: ReadConfigFileOptions & { optional: true }): RuntimeConfig | undefined;
/** Reads and parses a JSON config document; `undefined` only when `optional` and the file is absent. */
export function readConfigFile(options: ReadConfigFileOptions): RuntimeConfig | undefined;
/** Implementation overload for {@link readConfigFile}. */
export function readConfigFile(options: ReadConfigFileOptions): RuntimeConfig | undefined {
    try {
        return JSON.parse(readFileSync(options.path, 'utf8')) as RuntimeConfig;
    } catch (error) {
        if (options.optional && isFileNotFound(error)) {
            return undefined;
        }

        throw error;
    }
}

function isFileNotFound(error: unknown) {
    return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT';
}
