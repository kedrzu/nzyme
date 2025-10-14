import { parentPort, workerData } from 'node:worker_threads';

import { createEventEmitter } from '@nzyme/utils';

/**
 * Creates a runtime environment for the development server worker thread.
 * This function sets up source map support and provides methods to start the server.
 *
 * @returns An object containing the server port and start method
 */
export function devServerRuntime() {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const port = workerData?.port as number;
    const onExit = createEventEmitter<void>();

    parentPort?.on('message', message => {
        if (message === 'STOP') {
            void onStop();
        }
    });

    return {
        port,
        start,
        onExit: onExit.event,
    };

    /**
     * Starts the development server and notifies the parent thread.
     * This method should be called after the server is ready to accept connections.
     */
    function start() {
        // Notify the parent thread that server started.
        parentPort?.postMessage('START');
    }

    async function onStop() {
        await onExit.emit.async();
        parentPort?.close();
        process.exit();
    }
}
