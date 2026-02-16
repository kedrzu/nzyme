import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import type { RollupOptions } from 'rollup';
import sourcemapsPlugin from 'rollup-plugin-sourcemaps';

import { unwrapCjsDefaultImport } from '@nzyme/esm/unwrapCjsDefaultImport.js';

import { resolveExternalsPlugin } from './plugins/resolveExternalsPlugin.js';
import { watchFilesPlugin } from './plugins/watchFilesPlugin.js';

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
    /**
     * Whether to use TypeScript
     *
     * @default true
     */
    typescript?: boolean;
};

/**
 * Creates a Rollup configuration optimized for development server usage.
 * This configuration includes common plugins and settings for ESM output.
 *
 * @param options - Configuration options for the development server
 * @returns A Rollup configuration object with development-optimized settings
 */
export function devServerConfig(options: DevServerConfigOptions): RollupOptions {
    const ts = options.typescript ?? true;

    return {
        input: options.input,
        output: {
            format: 'esm',
            dir: options.outputDir,
            sourcemap: true,
        },
        plugins: [
            resolveExternalsPlugin(),
            nodeResolve({
                preferBuiltins: true,
                extensions: ['.js', '.mjs', '.ts', '.tsx', '.json'],
                exportConditions: ['node', 'module', 'import', 'require'],
            }),
            sourcemapsPlugin(),
            watchFilesPlugin(),
            unwrapCjsDefaultImport(commonjs)(),
            unwrapCjsDefaultImport(json)(),
            ts && unwrapCjsDefaultImport(typescript)(),
        ],
    };
}
