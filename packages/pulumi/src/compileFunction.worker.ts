import { createHash } from 'node:crypto';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parentPort, workerData } from 'node:worker_threads';

import { babel } from '@rollup/plugin-babel';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import chalk from 'chalk';
import { emptyDir } from 'fs-extra/esm';
import { rollup } from 'rollup';
import type { Plugin } from 'rollup';
import { bundleStats } from 'rollup-plugin-bundle-stats';
import sourcemaps from 'rollup-plugin-sourcemaps';
import { terser } from 'rollup-plugin-terser';

import { unwrapCjsDefaultImport } from '@nzyme/esm/unwrapCjsDefaultImport.js';
import { normalizeBuiltinsPlugin } from '@nzyme/rollup-utils/plugins/normalizeBuiltinsPlugin.js';
import { formatElapsedMs } from '@nzyme/utils/formatElapsedMs.js';
import { sortBy } from '@nzyme/utils/sortBy.js';

import { cloudFrontCheckRollupPlugin } from './cloudfront/cloudFrontCheckRollupPlugin.js';
import { cloudFrontFunctionPreset } from './cloudfront/cloudFrontFunctionPreset.js';
import type { CompileFunctionOptions, CompileFunctionPlugin, CompileFunctionResult } from './compileFunction.js';

const start = performance.now();
const options = workerData as CompileFunctionOptions;
const cloudFront = options.target === 'cloudfront';

const outputDir = options.outputDir;
const fileName = 'index';
const outputFile = path.join(outputDir, options.esm ? `${fileName}.mjs` : `${fileName}.js`);
const outputHash = createHash('md5');

await emptyDir(outputDir);

const extraPlugins = await loadPlugins(options.plugins ?? []);

const rollupResult = await rollup({
    input: options.inputFile,
    external: options.external,
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
                if (module.startsWith('aws-sdk')) {
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
        // Before source maps, Babel and the minifier, so any code these plugins emit is downleveled
        // and minified like the rest of the bundle. Plugins that must win module resolution over
        // node-resolve do so with `order: 'pre'` hooks, which position does not affect.
        ...extraPlugins,
        options.stats && bundleStats({}),
        options.sourcemaps &&
            sourcemaps({
                // Sentry has some broken sourcemaps
                exclude: /@sentry/,
            }),
        cloudFront &&
            babel({
                babelHelpers: 'bundled',
                // The preset carries its own targets: the CloudFront Functions runtime is an
                // allowlist, not an engine version, so `targets` cannot express it.
                presets: [cloudFrontFunctionPreset],
                plugins: [
                    [
                        // Needed for JSON modules
                        import.meta.resolve('@babel/plugin-syntax-import-attributes'),
                        {
                            deprecatedAssertSyntax: true,
                        },
                    ],
                ],
                sourceMaps: options.sourcemaps,
            }),
        !cloudFront &&
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
        options.minify &&
            terser(
                options.minify === true
                    ? {
                          toplevel: true,
                          compress: {
                              passes: 2,
                              dead_code: true,
                              drop_debugger: true,
                              pure_getters: false, // leave off unless you're sure
                              unsafe: false, // explicitly avoid unsafe transforms
                              unsafe_comps: false,
                              unused: true,
                          },
                          mangle: {
                              toplevel: true, // only if names are not used globally or in logs
                              properties: false,
                          },
                          format: {
                              comments: false,
                          },
                      }
                    : options.minify,
            ),
        // Rollup 4 runs `renderChunk` in plugin order, so this must stay AFTER the minifier to see
        // the exact bytes that get uploaded.
        cloudFront && cloudFrontCheckRollupPlugin(options.inputFile),
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
    dir: outputDir,
    format: options.esm ? 'esm' : 'cjs',
    exports: 'named',
    sourcemap: options.sourcemaps,
    entryFileNames: options.esm ? `${fileName}.mjs` : `${fileName}.js`,
    chunkFileNames: options.esm ? `[name].[hash].mjs` : `[name].[hash].js`,
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

/**
 * Builds the caller's plugins inside the worker: `workerData` carries only data, so each plugin
 * arrives as a module to import and a factory to call.
 */
async function loadPlugins(descriptors: CompileFunctionPlugin[]) {
    const plugins: Plugin[] = [];

    for (const descriptor of descriptors) {
        const specifier = path.isAbsolute(descriptor.module)
            ? pathToFileURL(descriptor.module).href
            : descriptor.module;
        const exportName = descriptor.export ?? 'default';
        const imported: unknown = await import(specifier);
        const factory: unknown =
            typeof imported === 'object' && imported !== null ? Reflect.get(imported, exportName) : undefined;

        if (!isPluginFactory(factory)) {
            throw new TypeError(`Rollup plugin module ${descriptor.module} has no function export "${exportName}"`);
        }

        const plugin: unknown = await factory(descriptor.options);
        if (!isRollupPlugin(plugin)) {
            throw new TypeError(
                `Export "${exportName}" of ${descriptor.module} did not return a rollup plugin (an object with a name)`,
            );
        }

        plugins.push(plugin);
    }

    return plugins;
}

function isPluginFactory(value: unknown): value is (options: unknown) => unknown {
    return typeof value === 'function';
}

function isRollupPlugin(value: unknown): value is Plugin {
    return typeof value === 'object' && value !== null && 'name' in value && typeof value.name === 'string';
}
