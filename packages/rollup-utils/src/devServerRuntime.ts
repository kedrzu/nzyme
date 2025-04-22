import { parentPort, workerData } from 'node:worker_threads';

import chalk from 'chalk';
import { consola } from 'consola';
import sourceMap from 'source-map-support';

import { createEventEmitter } from '@nzyme/utils';

/**
 * Creates a runtime environment for the development server worker thread.
 * This function sets up source map support and provides methods to start the server.
 *
 * @returns An object containing the server port and start method
 */
export function devServerRuntime() {
    sourceMap.install();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const port = workerData?.port as number;
    const events = createEventEmitter<{ exit: void }>();

    parentPort?.on('message', message => {
        if (message === 'STOP') {
            void onStop();
        }
    });

    return {
        port,
        start,
        on: events.on,
        off: events.off,
    };

    /**
     * Starts the development server and notifies the parent thread.
     * This method should be called after the server is ready to accept connections.
     */
    function start() {
        // Notify the parent thread that server started.
        parentPort?.postMessage('START');
        consola.info(`Worker listening on ${chalk.green(`http://localhost:${port}`)}.`);
    }

    async function onStop() {
        await events.emitAsync('exit');
        parentPort?.close();
        process.exit();
    }
}
