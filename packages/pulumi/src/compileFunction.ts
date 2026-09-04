import * as path from 'node:path';
import { Worker } from 'node:worker_threads';

import type { MinifyOptions } from 'terser';

import { getDirname } from '@nzyme/esm/dirname.js';

/**
 * Options shared by every compilation target.
 */
interface CompileFunctionOptionsBase {
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
 * Compile for a Node.js runtime — Lambdas and anything else running on Node.
 */
export interface CompileNodeFunctionOptions extends CompileFunctionOptionsBase {
    /**
     * Node.js version to compile for. Syntax above it is downleveled by `@babel/preset-env`.
     */
    nodeVersion?: number;
    target?: never;
}

/**
 * Compile for the CloudFront Functions `cloudfront-js-2.0` runtime.
 *
 * Disjoint from {@link CompileNodeFunctionOptions.nodeVersion} on purpose: that runtime is an
 * allowlist, not an engine version, so no Node version describes it. The target selects a dedicated
 * Babel preset AND a check of the final bundle against the runtime model.
 */
export interface CompileCloudFrontFunctionOptions extends CompileFunctionOptionsBase {
    target: 'cloudfront';
    nodeVersion?: never;
}

/**
 * Options for compiling a function.
 */
export type CompileFunctionOptions = CompileNodeFunctionOptions | CompileCloudFrontFunctionOptions;

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
