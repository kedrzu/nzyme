import chalk from 'chalk';
import connect from 'connect';
import { consola } from 'consola';

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
    const app = connect();
    const middleware = devServerMiddleware(options);

    app.use(middleware);
    app.listen(options.port, () => {
        consola.info(`Server listening on ${chalk.green(`http://localhost:${options.port}`)}`);
    });
}
