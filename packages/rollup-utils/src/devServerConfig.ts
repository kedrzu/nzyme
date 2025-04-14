import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import type { RollupOptions } from 'rollup';

import { unwrapCjsDefaultImport } from '@nzyme/esm';

/**
 * Configuration options for setting up a development server with Rollup.
 */
export type DevServerConfigOptions = {
    /**
     * The entry point file for the application
     */
    input: string;
    /**
     * The directory where compiled files will be output
     */
    outputDir: string;
};

/**
 * Creates a Rollup configuration optimized for development server usage.
 * This configuration includes common plugins and settings for ESM output.
 *
 * @param options - Configuration options for the development server
 * @returns A Rollup configuration object with development-optimized settings
 */
export function devServerConfig(options: DevServerConfigOptions): RollupOptions {
    return {
        input: options.input,
        output: {
            format: 'esm',
            dir: options.outputDir,
            sourcemap: true,
        },
        plugins: [
            nodeResolve({
                preferBuiltins: true,
                extensions: ['.js', '.mjs', '.ts', '.tsx', '.json'],
                exportConditions: ['node', 'module', 'import', 'require'],
            }),
            unwrapCjsDefaultImport(commonjs)(),
            unwrapCjsDefaultImport(json)(),
            unwrapCjsDefaultImport(typescript)(),
        ],
        external: source => {
            if (/^node:/.test(source) || /^[\w_-]+$/.test(source)) {
                // Node built-in modules and third party modules
                return true;
            }

            if (/node_modules/.test(source)) {
                return true;
            }

            return false;
        },
    };
}
