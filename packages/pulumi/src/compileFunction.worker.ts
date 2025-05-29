import { createHash } from 'crypto';
import * as path from 'path';
import { parentPort, workerData } from 'worker_threads';

import { babel } from '@rollup/plugin-babel';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import chalk from 'chalk';
import { emptyDir } from 'fs-extra/esm';
import { rollup } from 'rollup';
import sourcemaps from 'rollup-plugin-sourcemaps';
import { terser } from 'rollup-plugin-terser';

import { unwrapCjsDefaultImport } from '@nzyme/esm';
import { normalizeBuiltinsPlugin } from '@nzyme/rollup-utils';
import { formatElapsedMs, sortBy } from '@nzyme/utils';

import type { CompileFunctionOptions, CompileFunctionResult } from './compileFunction.js';

const start = performance.now();
const options = workerData as CompileFunctionOptions;

const outputDir = options.outputDir;
const fileName = 'index';
const outputFile = path.join(outputDir, options.esm ? `${fileName}.mjs` : `${fileName}.js`);
const outputHash = createHash('md5');

await emptyDir(outputDir);

const rollupResult = await rollup({
    input: options.inputFile,
    plugins: [
        normalizeBuiltinsPlugin(),
        nodeResolve({
            preferBuiltins: true,
            exportConditions: ['module', 'import', 'node', 'require'],
            resolveOnly: module => {
                // AWS SDK is included in the lambda runtime, so we don't need to bundle it.
                if (/^@aws-sdk\/.*/.test(module)) {
                    return false;
                }
                if (/^aws-sdk/.test(module)) {
                    return false;
                }

                return true;
            },
        }),
        unwrapCjsDefaultImport(commonjs)({
            transformMixedEsModules: options.esm,
        }),
        unwrapCjsDefaultImport(json)(),
        // unwrapCjsDefaultImport(esbuild)({
        //     sourceMap: options.sourcemaps,
        //     define: options.define,
        //     target: 'esnext',
        // }),
        unwrapCjsDefaultImport(replace)({
            ...options.define,
            sourceMap: true,
            preventAssignment: true,
        }),
        options.sourcemaps &&
            sourcemaps({
                // Sentry has some broken sourcemaps
                exclude: /@sentry/,
            }),
        options.nodeVersion != null &&
            babel({
                babelHelpers: 'bundled',
                presets: [[import.meta.resolve('@babel/preset-env')]],
                plugins: [
                    [
                        // Needed for JSON modules
                        import.meta.resolve('@babel/plugin-syntax-import-attributes'),
                        {
                            deprecatedAssertSyntax: true,
                        },
                    ],
                ],
                targets: {
                    esmodules: options.esm,
                    node: options.nodeVersion.toString(),
                },
                sourceMaps: options.sourcemaps,
            }),
        options.terser && terser(options.terser),
    ],
    onwarn: warning => {
        // this warning we can safely ignore
        // https://stackoverflow.com/a/43556986/2202583
        if (warning.code === 'THIS_IS_UNDEFINED') {
            return;
        }

        if (warning.code === 'CIRCULAR_DEPENDENCY' && warning.ids?.find(id => id.includes('node_modules/'))) {
            return;
        }

        // console.warn everything else
        console.warn(warning.message);
    },
});

const rollupOutput = await rollupResult.write({
    file: outputFile,
    inlineDynamicImports: true,
    format: options.esm ? 'esm' : 'cjs',
    exports: 'named',
    sourcemap: options.sourcemaps,
    // entryFileNames: options.esm ? `${fileName}.mjs` : `${fileName}.js`,
    hoistTransitiveImports: true,
});

const outputFiles = sortBy(rollupOutput.output, item => item.fileName);

for (const file of outputFiles) {
    outputHash.update(file.fileName);

    if (file.type === 'chunk') {
        outputHash.update(file.code);
    }
}

await rollupResult.close();

console.info(`Compiled ${chalk.green(options.inputFile)} in ${chalk.green(formatElapsedMs(start))}`);

const output: CompileFunctionResult = {
    dirPath: outputDir,
    filePath: outputFile,
    fileName: fileName,
    hash: outputHash.digest('hex'),
};

parentPort?.postMessage(output);
