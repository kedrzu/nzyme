import { parentPort, workerData } from 'node:worker_threads';

import chalk from 'chalk';
import { consola } from 'consola';
import sourceMap from 'source-map-support';

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

    return {
        port,
        start,
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
}
