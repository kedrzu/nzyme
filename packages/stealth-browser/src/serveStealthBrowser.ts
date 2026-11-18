import { createLogger } from '@nzyme/logging/createLogger.js';

import type { CdpClient } from './connectClient.js';
import { launchStealthBrowser } from './launchStealthBrowser.js';
import type { LaunchStealthBrowserOptions, StealthBrowser } from './launchStealthBrowser.js';

/** How the browser is launched and where it is served. */
export interface ServeStealthBrowserOptions extends LaunchStealthBrowserOptions<undefined> {
    /** The local port to listen on; any free one by default. */
    port?: number;
}

/** A browser served over a WebSocket. */
export interface StealthBrowserServer {
    /** The URL a CDP client connects to: `ws://127.0.0.1:<port>/<token>`. Whoever has it drives the browser. */
    endpoint: string;
    browser: StealthBrowser<undefined>;
    /** Stops the server, closing every client, and closes the browser. */
    close(): Promise<void>;
}

/** What an accepted socket carries: its client, once connected. */
interface ServerSocketData {
    client?: CdpClient;
}

/** WebSocket close code: the message's type is not one the server accepts. */
const CLOSE_UNSUPPORTED_DATA = 1003;

/**
 * Launches the browser and serves it to CDP clients on `127.0.0.1` only, at a path holding a random token. An upgrade
 * with any `Origin` header is refused, so no web page the user opens can reach it; one on another path is refused
 * too. Each socket is a client of its own with no group: it sees every page but the proxy's own. The browser is
 * launched before the server listens, so no client ever waits for it.
 */
export async function serveStealthBrowser(options: ServeStealthBrowserOptions): Promise<StealthBrowserServer> {
    const logger = options.logger ?? createLogger('StealthBrowser');
    const browser = await launchStealthBrowser<undefined>({ ...options, logger });
    const token = crypto.randomUUID();

    let server: Bun.Server<ServerSocketData>;
    try {
        server = Bun.serve<ServerSocketData>({
            hostname: '127.0.0.1',
            port: options.port ?? 0,
            fetch(request, self) {
                const refusal = checkUpgrade(request, token);
                if (refusal) {
                    return refusal;
                }
                if (self.upgrade(request, { data: {} })) {
                    return undefined;
                }
                return new Response('A WebSocket upgrade is expected', { status: 400 });
            },
            websocket: {
                open(socket) {
                    socket.data.client = browser.connect(socket, { data: undefined });
                },
                message(socket, message) {
                    if (typeof message === 'string') {
                        socket.data.client?.receive(message);
                    } else {
                        socket.close(CLOSE_UNSUPPORTED_DATA, 'CDP messages are text');
                    }
                },
                close(socket) {
                    socket.data.client?.close();
                },
            },
        });
    } catch (error) {
        await browser.close();
        throw error;
    }

    logger.info('The browser is served', { port: server.port });
    return {
        endpoint: `ws://127.0.0.1:${server.port}/${token}`,
        browser,
        close,
    };

    async function close() {
        await server.stop(true);
        await browser.close();
    }
}

/** The response refusing an upgrade, or `null` when it may go ahead. */
function checkUpgrade(request: Request, token: string) {
    // A web page's WebSocket always sends Origin; a CDP client does not. A page must never reach the browser.
    if (request.headers.has('origin')) {
        return new Response('Forbidden', { status: 403 });
    }
    const { pathname } = new URL(request.url);
    if (pathname === `/${token}`) {
        return null;
    }
    // A single path segment is a token, a wrong one; anything else is a path the server does not have.
    if (/^\/[^/]+$/.test(pathname)) {
        return new Response('Unauthorized', { status: 401 });
    }
    return new Response('Not Found', { status: 404 });
}
