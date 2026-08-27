import * as fs from 'node:fs/promises';

import { compileFunction } from './compileFunction.js';

/**
 * Options for compiling a CloudFront function.
 */
export interface CloudfrontFunctionOptions {
    /**
     * The path to the input file.
     */
    inputFile: string;
    /**
     * The directory where the compiled function output will be written.
     */
    outputDir: string;
    /**
     * Define variables to be used in the function.
     */
    define?: Record<string, string>;
}

/**
 * Compile a CloudFront function.
 */
export async function compileCloudFrontFunction(options: CloudfrontFunctionOptions) {
    const result = await compileFunction({
        ...options,
        esm: false,
        nodeVersion: 5,
        minify: true,
        sourcemaps: false,
    });

    const code = await fs.readFile(result.filePath, 'utf8');

    return {
        ...result,
        code,
    };
}
