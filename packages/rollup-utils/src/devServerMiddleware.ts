import path from 'node:path';
import { Worker } from 'node:worker_threads';

import chalk from 'chalk';
import type { NextHandleFunction } from 'connect';
import { consola } from 'consola';
import getPort from 'get-port';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { type RollupWatchOptions, watch } from 'rollup';

import { createPromise, formatDurationMs, formatElapsedMs } from '@nzyme/utils';

import { onRollupWarning } from './onRollupWarning.js';

/**
 *
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

        async function stop() {
            server = undefined;
            await worker?.terminate();
        }
    }
}

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
