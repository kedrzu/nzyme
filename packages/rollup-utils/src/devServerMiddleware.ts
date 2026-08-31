import path from 'node:path';

import chalk from 'chalk';
import type { NextHandleFunction } from 'connect';
import { watch } from 'rollup';
import type { RollupWatchOptions } from 'rollup';

import { formatDurationMs } from '@nzyme/utils/formatDurationMs.js';
import { omitProps } from '@nzyme/utils/omitProps.js';

import type { DevServer } from './createDevServer.js';
import { createDevServer } from './createDevServer.js';
import { onRollupWarning } from './onRollupWarning.js';

/**
 * Options for the development server middleware.
 */
export interface DevServerMiddlewareOptions extends RollupWatchOptions {
    /**
     * Environment variables to set in the worker thread.
     */
    env?: Record<string, string>;
}

/**
 * Creates a middleware function that handles development server requests and hot reloading.
 * This middleware manages the Rollup watcher and worker thread for the development server.
 *
 * @param options - Rollup watch configuration options
 * @returns A middleware function that handles development server requests
 * @throws {Error} If the input or output configuration is invalid
 */
export function devServerMiddleware(options: DevServerMiddlewareOptions) {
    const outputFile = getOutputFile(options);

    startRollup();

    let compiled = false;
    let server: DevServer | undefined;

    const middleware: NextHandleFunction = (req, res, next) => {
        if (!server && compiled) {
            void newServer().start();
        }

        if (server) {
            server.middleware(req, res, next);
        } else {
            next();
        }
    };

    return {
        middleware,
        restart,
    };

    /**
     * Starts the Rollup watcher and handles compilation events
     */
    function startRollup() {
        const watcher = watch({
            watch: {
                clearScreen: false,
                buildDelay: 300,
            },
            onwarn: onRollupWarning(),
            ...omitProps(options, ['env']),
        });

        watcher.on('event', event => {
            if (event.code === 'BUNDLE_START') {
                newServer();
            } else if (event.code === 'BUNDLE_END') {
                compiled = true;

                const duration = formatDurationMs(event.duration);
                console.info(`Server compiled in ${chalk.green(duration)}.`);
                void server?.start();
            } else if (event.code === 'ERROR') {
                console.error(event.error);
            }
        });
    }

    function restart() {
        return newServer().start();
    }

    /**
     * Creates a new development server instance
     * @returns An object containing the server's middleware and control methods
     */
    function newServer() {
        // Stop the current server
        server?.stop();

        const devServer = createDevServer({ file: outputFile });
        server = devServer;

        devServer.events.stopped.on(() => {
            if (server === devServer) {
                server = undefined;
            }
        });

        return devServer;
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
        throw new TypeError('Input must be single file');
    }

    if (!options.output) {
        throw new Error('Output is required');
    }

    if (Array.isArray(options.output)) {
        throw new TypeError('Output must be single file');
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
