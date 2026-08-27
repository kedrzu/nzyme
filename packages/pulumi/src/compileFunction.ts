import * as path from 'node:path';
import { Worker } from 'node:worker_threads';

import type { MinifyOptions } from 'terser';

import { getDirname } from '@nzyme/esm/dirname.js';

/**
 * Options for compiling a function.
 */
export interface CompileFunctionOptions {
    /**
     * Path to the input file.
     */
    inputFile: string;
    /**
     * Path to the output directory.
     */
    outputDir: string;
    /**
     * Whether to use ESM modules.
     */
    esm?: boolean;
    /**
     * Node.js version to compile for.
     */
    nodeVersion?: number;
    /**
     * Whether to minify the output. Can be a boolean to use default safe options, or a MinifyOptions object for custom terser settings.
     */
    minify?: boolean | MinifyOptions;
    /**
     * Whether to generate sourcemaps.
     */
    sourcemaps?: boolean;
    /**
     * Define variables.
     */
    define?: Record<string, string>;
    /**
     * External libraries to exclude from bundle and copy to node_modules.
     */
    external?: string[];
    /**
     * Whether to generate bundle statistics.
     */
    stats?: boolean;
}

/**
 * Result of compiling a function.
 */
export interface CompileFunctionResult {
    /**
     * Path to the directory containing the compiled files.
     */
    dirPath: string;
    /**
     * Path to the compiled file.
     */
    filePath: string;
    /**
     * Name of the compiled file.
     */
    fileName: string;
    /**
     * Hash of the compiled file.
     */
    hash: string;
}

const dirname = getDirname(import.meta.url);

/**
 * Compile a function.
 */
export function compileFunction(options: CompileFunctionOptions) {
    return new Promise<CompileFunctionResult>((resolve, reject) => {
        const workerFile = path.join(dirname, 'compileFunction.worker.js');
        const worker = new Worker(workerFile, {
            workerData: options,
        });

        worker.on('error', err => {
            reject(err instanceof Error ? err : new Error(String(err)));
            void worker.terminate();
        });

        worker.on('message', msg => {
            resolve(msg as CompileFunctionResult);
        });
    });
}
