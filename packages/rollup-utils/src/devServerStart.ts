import { execSync } from 'node:child_process';

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
};

/**
 * Starts the dev server with auto-reload.
 */
export function devServerStart(options: DevServerOptions) {
    install();

    const server = connect();
    const { port: _, ...rest } = options;
    const { middleware, restart } = devServerMiddleware(rest);

    const port = Promise.resolve(options.port ?? getPort());

    server.use(middleware);

    void port.then(port => {
        server.listen(port, () => {
            console.info(`Server listening on ${chalk.green(`http://localhost:${port}`)}`);
        });
    });

    installShutdownHandlers();

    return {
        server,
        restart,
    };
}

/**
 * Ensure the dev server exits when its task runner (e.g. turbo) goes away.
 *
 * Without this, Ctrl-C in a TTY works fine (the signal reaches the whole
 * process group), but any path that kills the runner *without* signalling its
 * descendants — turbo crash, force-quit, a wrapper that signals only the
 * runner PID — leaves the intermediate `bun run <script>` wrapper alive as an
 * orphan, which in turn keeps the dev server holding its port.
 *
 * The grandparent (turbo) is the closest reliable death signal: our immediate
 * parent is the `bun run` wrapper, which doesn't exit when *its* parent dies.
 * So poll the grandparent PID and exit when it disappears.
 */
function installShutdownHandlers() {
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
        process.on(signal, () => process.exit(0));
    }

    const grandparentPid = getGrandparentPid();
    if (!grandparentPid || grandparentPid === 1) {
        return;
    }

    const watcher = setInterval(() => {
        if (!isProcessAlive(grandparentPid)) {
            process.exit(0);
        }
    }, 1000);
    watcher.unref();
}

function getGrandparentPid(): number | undefined {
    try {
        const out = execSync(`ps -p ${process.ppid} -o ppid=`, { encoding: 'utf8' });
        const pid = Number(out.trim());
        return Number.isFinite(pid) ? pid : undefined;
    } catch {
        return undefined;
    }
}

function isProcessAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}
