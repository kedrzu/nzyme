import chalk from 'chalk';
import connect from 'connect';
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
    port: number;
};

/**
 * Starts the dev server with auto-reload.
 */
export function devServerStart(options: DevServerOptions) {
    install();

    const server = connect();
    const { port: _, ...rest } = options;
    const { middleware, restart } = devServerMiddleware(rest);

    server.use(middleware);
    server.listen(options.port, () => {
        console.info(`Server listening on ${chalk.green(`http://localhost:${options.port}`)}`);
    });

    return {
        server,
        restart,
    };
}
