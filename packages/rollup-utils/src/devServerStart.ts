import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import chalk from 'chalk';
import connect from 'connect';
import getPort from 'get-port';
import { install } from 'source-map-support';

import type { DevServerMiddlewareOptions } from './devServerMiddleware.js';
import { devServerMiddleware } from './devServerMiddleware.js';

/**
 * Options for the dev server.
 */
export type DevServerOptions = DevServerMiddlewareOptions & {
    /**
     * The port to listen on.
     */
    port?: number;
    /**
     * The address to listen on, e.g. `'127.0.0.1'` to keep the server off the network.
     *
     * @default every interface
     */
    host?: string;
};

/**
 * Starts the dev server with auto-reload.
 */
export function devServerStart(options: DevServerOptions) {
    install();

    const server = connect();
    const { port: _, host, ...rest } = options;
    const { middleware, restart } = devServerMiddleware(rest);

    const port = Promise.resolve(options.port ?? getPort());

    server.use(middleware);

    const httpServer = createServer(server);

    void port.then(resolvedPort => {
        httpServer.listen(resolvedPort, host, () => {
            const { port: listeningPort } = httpServer.address() as AddressInfo;
            console.info(`Server listening on ${chalk.green(`http://${host ?? 'localhost'}:${listeningPort}`)}`);
        });
        return undefined;
    });

    return {
        server,
        httpServer,
        restart,
    };
}
