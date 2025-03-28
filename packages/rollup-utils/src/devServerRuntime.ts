import { parentPort, workerData } from 'node:worker_threads';

import chalk from 'chalk';
import { consola } from 'consola';
import sourceMap from 'source-map-support';

export function devServerRuntime() {
    sourceMap.install();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const port = workerData?.port as number;

    return {
        port,
        start,
    };

    function start() {
        // Notify the parent thread that server started.
        parentPort?.postMessage('START');
        consola.info(`Worker listening on ${chalk.green(`http://localhost:${port}`)}.`);
    }
}
