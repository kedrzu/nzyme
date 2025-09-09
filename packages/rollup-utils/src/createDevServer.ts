import { Worker } from 'node:worker_threads';

import chalk from 'chalk';
import type { NextHandleFunction } from 'connect';
import getPort from 'get-port';
import { createProxyMiddleware } from 'http-proxy-middleware';

import { createEventEmitter, createPromise, formatElapsedMs } from '@nzyme/utils';

/**
 *
 */
export interface DevServerOptions {
    /**
     *
     */
    file: string;

    /**
     * Maximum number of retries to start the server.
     * @default 3
     */
    maxRetries?: number;
}

/**
 *
 */
export type DevServer = ReturnType<typeof createDevServer>;

/**
 * Creates a new development server instance
 * @returns An object containing the server's middleware and control methods
 */
export function createDevServer(options: DevServerOptions) {
    let retries = 0;
    const maxRetries = options.maxRetries ?? 3;
    let worker: Worker | undefined;
    let status: 'idle' | 'running' | 'stopped' = 'idle';
    const proxyPromise = createPromise<NextHandleFunction>();
    const onStarted = createEventEmitter<void>();
    const onStopped = createEventEmitter<void>();
    const onError = createEventEmitter<unknown>();

    const middleware: NextHandleFunction = (req, res, next) => {
        void proxyPromise.promise.then(p => p(req, res, next));
    };

    return {
        middleware,
        start,
        stop,
        onStarted: onStarted.event,
        onStopped: onStopped.event,
        onError: onError.event,
    };

    /**
     * Starts the worker thread and sets up the proxy middleware
     */
    async function start() {
        if (status === 'running') {
            // already started
            return;
        }

        if (status === 'stopped') {
            throw new Error('Server is stopped');
        }

        status = 'running';

        const timestamp = performance.now();
        const port = await getPort();

        worker = new Worker(options.file, {
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
            console.error(err);
            onError.emit(err);
        });

        worker.on('exit', () => {
            console.info(`Worker ${port} exited`);

            if (status === 'running' && retries < maxRetries) {
                retries++;
                void start();
            } else {
                onStopped.emit();
            }
        });

        const proxy = createProxyMiddleware({
            target: `http://localhost:${port}`,
        });

        worker.on('message', e => {
            if (e === 'START') {
                console.info(`Server started in ${chalk.green(formatElapsedMs(timestamp))}`);
                proxyPromise.resolve(proxy as NextHandleFunction);
                onStarted.emit();
            }
        });
    }

    /**
     * Stops the worker thread and cleans up resources
     */
    function stop() {
        status = 'stopped';
        worker?.postMessage('STOP');
    }
}
