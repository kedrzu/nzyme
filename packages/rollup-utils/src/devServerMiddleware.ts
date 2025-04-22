import path from 'node:path';
import { Worker } from 'node:worker_threads';

import chalk from 'chalk';
import type { NextHandleFunction } from 'connect';
import { consola } from 'consola';
import getPort from 'get-port';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { watch } from 'rollup';
import type { RollupWatchOptions } from 'rollup';

import { createPromise, formatDurationMs, formatElapsedMs } from '@nzyme/utils';

import { onRollupWarning } from './onRollupWarning.js';

/**
 * Creates a middleware function that handles development server requests and hot reloading.
 * This middleware manages the Rollup watcher and worker thread for the development server.
 *
 * @param options - Rollup watch configuration options
 * @returns A middleware function that handles development server requests
 * @throws {Error} If the input or output configuration is invalid
 */
export function devServerMiddleware(options: RollupWatchOptions): NextHandleFunction {
    const outputFile = getOutputFile(options);

    startRollup();

    let compiled = false;
    let server: ReturnType<typeof createServer> | undefined;

    return (req, res, next) => {
        if (!server && compiled) {
            server = createServer();
            void server.start();
        }

        if (server) {
            void server.middleware(req, res, next);
        } else {
            next();
        }
    };

    /**
     * Starts the Rollup watcher and handles compilation events
     */
    function startRollup() {
        const watcher = watch({
            onwarn: onRollupWarning,
            ...options,
        });

        watcher.on('event', event => {
            if (event.code === 'BUNDLE_START') {
                server = createServer();
            } else if (event.code === 'BUNDLE_END') {
                compiled = true;

                const duration = formatDurationMs(event.duration);
                consola.info(`Server compiled in ${chalk.green(duration)}.`);
                void server?.start();
            } else if (event.code === 'ERROR') {
                consola.error(event.error);
            }
        });
    }

    /**
     * Creates a new development server instance
     * @returns An object containing the server's middleware and control methods
     */
    function createServer() {
        // Stop the current server
        void server?.stop();

        let worker: Worker | undefined;
        const proxyPromise = createPromise<NextHandleFunction>();

        const middleware: NextHandleFunction = (req, res, next) => {
            void proxyPromise.promise.then(p => p(req, res, next));
        };

        return {
            middleware,
            start,
            stop,
        };

        /**
         * Starts the worker thread and sets up the proxy middleware
         */
        async function start(this: unknown) {
            if (worker) {
                // already started
                return;
            }

            const start = performance.now();
            const port = await getPort();

            worker = new Worker(outputFile, {
                stderr: true,
                stdout: true,
                workerData: {
                    port,
                },
                env: {
                    ...process.env,
                    DEBUG_COLORS: '1', // without this settings, colors won't be shown
                },
            });

            worker.stdout.pipe(process.stdout);
            worker.stderr.pipe(process.stderr);

            worker.on('error', err => {
                consola.error(err);
            });

            worker.on('exit', () => {
                if (server === this) {
                    server = undefined;
                }

                consola.info(`Worker ${port} exited`);
            });

            const proxy = createProxyMiddleware({
                target: `http://localhost:${port}`,
            });

            worker.on('message', e => {
                if (e === 'START') {
                    consola.info(`Server started in ${chalk.green(formatElapsedMs(start))}`);
                    proxyPromise.resolve(proxy as NextHandleFunction);
                }
            });
        }

        /**
         * Stops the worker thread and cleans up resources
         */
        function stop() {
            server = undefined;
            worker?.postMessage('STOP');
        }
    }
}

/**
 * Determines the output file path from Rollup watch options
 * @param options - Rollup watch configuration options
 * @returns The absolute path to the output file
 * @throws {Error} If the input or output configuration is invalid
 */
function getOutputFile(options: RollupWatchOptions) {
    if (typeof options.input !== 'string') {
        throw new Error('Input must be single file');
    }

    if (!options.output) {
        throw new Error('Output is required');
    }

    if (Array.isArray(options.output)) {
        throw new Error('Output must be single file');
    }

    if (typeof options.output.file === 'string') {
        const cwd = process.cwd();
        const outputFile = path.resolve(cwd, options.output.file);

        return outputFile;
    }

    if (typeof options.output.dir === 'string') {
        const inputExtension = path.extname(options.input);
        const inputBase = path.basename(options.input, inputExtension);
        const outputFile = path.join(options.output.dir, `${inputBase}.js`);

        return outputFile;
    }

    throw new Error('Output must be file or directory');
}
