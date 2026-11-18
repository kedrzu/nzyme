import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { Readable, Writable } from 'node:stream';

import { createLogger } from '@nzyme/logging/createLogger.js';
import type { Logger } from '@nzyme/logging/Logger.js';
import { assert } from '@nzyme/utils/assert.js';
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';
import { withTimeout } from '@nzyme/utils/withTimeout.js';

import { attachTargetSession } from './attachTargetSession.js';
import { buildStealthArgs } from './buildStealthArgs.js';
import { CdpError } from './CdpTypes.js';
import type { CdpErrorReply, CdpEvent, CdpPolicy, CdpSocket } from './CdpTypes.js';
import { connectClient } from './connectClient.js';
import type { CdpClient } from './connectClient.js';
import { createBrandOverride } from './createBrandOverride.js';
import { createSessionRegistry } from './createSessionRegistry.js';
import { ATTACH_SITE_PACE } from './createSitePace.js';
import type { SitePace } from './createSitePace.js';
import { splitPipeFrames } from './splitPipeFrames.js';

/** How the browser is launched, and what its clients may do. */
export interface LaunchStealthBrowserOptions<D = unknown> {
    /** The Chrome (or Chrome for Testing) binary. */
    executablePath: string;
    /** The profile folder: cookies and logins live here. */
    userDataDir: string;
    /** Appended to the base command line, e.g. `--headless=new`. */
    args?: string[];
    /**
     * Judges each client request after the proxy's session and target checks and before its stealth rules, which no
     * policy can lift; `D` is the data the caller passes to `connect` for each client.
     */
    policy?: CdpPolicy<D>;
    /**
     * The human pace kept on every site, checked after the stealth rules: a command that loads a page waits for its
     * site's slot or is refused. Hand the same pace to the next launch to keep what it learned of blocks. None: nothing
     * waits.
     */
    pace?: SitePace;
    /** How long configuring the started browser, reading its identity included, may take; 15 s by default. */
    startTimeoutMs?: number;
    logger?: Logger;
}

/** How the browser process ended. */
export interface StealthBrowserExit {
    code: number | null;
    signal: NodeJS.Signals | null;
}

/** Which group each page belongs to; a popup joins its opener's group. */
export interface StealthBrowserGroups {
    /** The group a target belongs to; `undefined` for one no group owns. */
    of(targetId: string): string | undefined;
    /** Every target of a group. */
    targets(group: string): string[];
    /** The group's target used, or claimed, last; `undefined` when it has none left. */
    lastUsed(group: string): string | undefined;
}

/** A client `connect` adds. */
export interface StealthBrowserClientOptions<D = unknown> {
    /** The group whose pages the client sees and the pages it creates join; none: every page but the proxy's own. */
    group?: string;
    /** Handed to the policy with each of the client's requests. */
    data: D;
}

/**
 * A launched browser driven over `--remote-debugging-pipe`, so no other local process can reach it. Every page and
 * worker in it names itself Google Chrome from its first script on.
 */
export interface StealthBrowser<D = unknown> {
    pid: number;
    /** Settles once the process is gone; pending calls are rejected by then. */
    exited: Promise<StealthBrowserExit>;
    /**
     * Sends a CDP command, to a session when `sessionId` is given, and resolves with its unchecked `result`. Rejects
     * with `CdpError` when the browser answers with an error, and with a plain `Error` once the browser has exited or
     * when it exits before answering.
     */
    send(method: string, params?: object, sessionId?: string): Promise<unknown>;
    /**
     * Attaches a flat session to `targetId` that belongs to the browser's owner, never to a client, and resolves with its
     * id once the browser has answered the target's brand, so a new page navigated on the session reads the brand from
     * its first script. The caller detaches it with `Target.detachFromTarget` when done.
     */
    attach(targetId: string): Promise<string>;
    /** Subscribes to every CDP event, delivered after the session registry and the brand saw it; returns the unsubscribe. */
    onEvent(listener: (event: CdpEvent) => void): () => void;
    groups: StealthBrowserGroups;
    /**
     * Connects a client: the caller feeds it the socket's messages (`receive`) and tells it when the socket closed
     * (`close`). Its commands go through the proxy's checks, the policy and the stealth rules; it sees only its own
     * sessions and the targets of its group. When the browser exits, the socket is closed with 1011.
     */
    connect(socket: CdpSocket, client: StealthBrowserClientOptions<D>): CdpClient;
    /** Closes the browser and resolves once its process is gone. */
    close(): Promise<void>;
}

/** A call waiting for its reply. */
interface PendingCall {
    resolve(result: unknown): void;
    reject(error: Error): void;
}

/** A connected client and its socket, closed when the browser exits. */
interface ConnectedClient {
    socket: CdpSocket;
    client: CdpClient;
}

/** WebSocket close code: the server met a condition it cannot go on from. */
const CLOSE_SERVER_ERROR = 1011;
/** How long configuring the browser at launch, reading its own identity included, may take before the launch fails. */
const START_TIMEOUT_MS = 15_000;
/** How long `close` waits for the browser to exit on its own before killing it. */
const CLOSE_TIMEOUT_MS = 5000;
/** How much of the browser's stderr is kept for the exit log. */
const STDERR_TAIL_LENGTH = 2000;

/**
 * Launches the browser and resolves once it is ready: targets are discovered and the brand holds every new target, so
 * nothing reaches the browser before it is configured. When configuring fails or takes longer than `startTimeoutMs`
 * (a browser that never answers), the process is killed and the launch rejects.
 */
export async function launchStealthBrowser<D = unknown>(
    options: LaunchStealthBrowserOptions<D>,
): Promise<StealthBrowser<D>> {
    const logger = options.logger ?? createLogger('StealthBrowser');
    const startTimeoutMs = options.startTimeoutMs ?? START_TIMEOUT_MS;
    const registry = createSessionRegistry();
    const pending = new Map<number, PendingCall>();
    const listeners = new Set<(event: CdpEvent) => void>();
    const clients = new Set<ConnectedClient>();
    let lastId = 0;
    let lastClientId = 0;
    let running = true;
    let closing = false;
    let stderrTail = '';

    const child = await spawnBrowser();
    const { pid } = child;
    assert(pid != null, 'The browser was spawned without a pid');

    const { stderr, pipe, input } = readPipes(child);

    const brand = createBrandOverride({ send: call, registry, logger });
    const pace = options.pace?.[ATTACH_SITE_PACE](registry);
    const exited = new Promise<StealthBrowserExit>(resolve => {
        child.once('exit', (code, signal) => resolve(onExit(code, signal)));
    });

    child.on('error', error => logger.error('The browser process failed', { error }));
    pipe.on('error', error => logger.debug('The pipe to the browser failed', { error }));
    stderr.on('data', (chunk: Buffer) => {
        stderrTail = (stderrTail + chunk.toString()).slice(-STDERR_TAIL_LENGTH);
    });
    let rest = Buffer.alloc(0);
    input.on('data', (chunk: Buffer) => {
        const split = splitPipeFrames(rest.length > 0 ? Buffer.concat([rest, chunk]) : chunk);
        rest = Buffer.from(split.rest);
        for (const frame of split.frames) {
            handleFrame(frame);
        }
    });

    try {
        // A browser that never answers would leave the launch waiting for good; failing kills it instead.
        await withTimeout({
            operation: configure(),
            timeoutMs: startTimeoutMs,
            onTimeout: () => {
                throw new Error('The browser did not start in time');
            },
        });
    } catch (error) {
        logger.error('The browser could not be configured', { error, pid });
        child.kill('SIGKILL');
        await exited;
        throw error;
    }
    logger.info('The browser started', { pid });

    return {
        pid,
        exited,
        send,
        attach,
        onEvent,
        groups: {
            of: targetId => registry.getTargetGroup(targetId),
            targets: group => registry.getTargets(group),
            lastUsed: group => registry.lastUsed(group),
        },
        connect,
        close,
    };

    async function configure() {
        await call('Target.setDiscoverTargets', { discover: true });
        await brand.start();
    }

    function send(method: string, params?: object, sessionId?: string) {
        if (!running) {
            return Promise.reject(new Error('The browser is not running'));
        }
        return call(method, params, sessionId);
    }

    async function attach(targetId: string) {
        // Navigated before the brand is answered, a new page's first script can read the browser's own name under load.
        await brand.whenBranded(targetId);
        const sessionId = await attachTargetSession({ send, registry, originator: { type: 'proxy' }, targetId });
        registry.claimSession({ type: 'proxy' }, sessionId, targetId);
        return sessionId;
    }

    function onEvent(listener: (event: CdpEvent) => void) {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    }

    function connect(socket: CdpSocket, client: StealthBrowserClientOptions<D>): CdpClient {
        const connected: ConnectedClient = {
            socket,
            client: connectClient({
                clientId: `client-${++lastClientId}`,
                group: client.group,
                data: client.data,
                socket,
                send,
                registry,
                brand,
                onEvent,
                policy: options.policy,
                pace,
                logger,
            }),
        };
        if (!running) {
            closeClient(connected);
            return connected.client;
        }
        clients.add(connected);
        return {
            receive: text => connected.client.receive(text),
            close: () => {
                clients.delete(connected);
                connected.client.close();
            },
        };
    }

    async function close() {
        if (!running) {
            await exited;
            return;
        }
        closing = true;
        await call('Browser.close').catch((error: unknown) =>
            logger.debug('The browser could not be closed gracefully', { error }),
        );
        await withTimeout({
            operation: exited,
            timeoutMs: CLOSE_TIMEOUT_MS,
            onTimeout: () => {
                child.kill('SIGKILL');
                return exited;
            },
        });
    }

    async function spawnBrowser() {
        const args = buildStealthArgs({ userDataDir: options.userDataDir, args: options.args });
        // fd 3 is what the browser reads commands from, fd 4 where it writes replies and events.
        const spawned = spawn(options.executablePath, args, { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
        await new Promise<void>((resolve, reject) => {
            spawned.once('spawn', resolve);
            spawned.once('error', reject);
        });
        return spawned;
    }

    function call(method: string, params?: object, sessionId?: string) {
        const id = ++lastId;
        return new Promise<unknown>((resolve, reject) => {
            if (!running) {
                reject(new Error('The browser exited'));
                return;
            }
            pending.set(id, { resolve, reject });
            pipe.write(`${JSON.stringify({ id, method, params: params ?? {}, sessionId })}\0`);
        });
    }

    function handleFrame(frame: string) {
        let message: unknown;
        try {
            message = JSON.parse(frame);
        } catch (error) {
            logger.warn('The browser sent a malformed message', { error });
            return;
        }
        if (!isPlainObject(message)) {
            return;
        }

        const { id, method, sessionId } = message;
        if (typeof id === 'number') {
            const waiting = pending.get(id);
            pending.delete(id);
            const error = readErrorReply(message['error']);
            if (error) {
                waiting?.reject(new CdpError(error));
            } else {
                waiting?.resolve(message['result']);
            }
            return;
        }
        if (typeof method === 'string') {
            dispatchEvent({
                method,
                params: message['params'],
                sessionId: typeof sessionId === 'string' ? sessionId : undefined,
            });
        }
    }

    function dispatchEvent(event: CdpEvent) {
        registry.observe(event);
        brand.observe(event);
        pace?.observe(event);
        for (const listener of listeners) {
            try {
                listener(event);
            } catch (error) {
                logger.error('A browser event listener failed', { error, method: event.method });
            }
        }
    }

    function onExit(code: number | null, signal: NodeJS.Signals | null): StealthBrowserExit {
        running = false;
        for (const waiting of pending.values()) {
            waiting.reject(new Error('The browser exited'));
        }
        pending.clear();
        registry.clear();
        pace?.detach();
        for (const connected of clients) {
            closeClient(connected);
        }
        clients.clear();
        if (closing) {
            logger.info('The browser closed', { code, signal });
        } else {
            logger.warn('The browser exited', { code, signal, stderr: stderrTail.trim() });
        }
        return { code, signal };
    }
}

/** Closes a client's socket and the client: the browser it drove is gone. */
function closeClient(connected: ConnectedClient) {
    connected.client.close();
    connected.socket.close(CLOSE_SERVER_ERROR, 'The browser exited');
}

/** The browser's stderr and its two ends of the debugging pipe; kills the browser when one is missing. */
function readPipes(child: ChildProcess) {
    const [, , stderr, pipe, input] = child.stdio;
    if (!(pipe instanceof Writable) || !(input instanceof Readable) || !(stderr instanceof Readable)) {
        child.kill('SIGKILL');
        throw new Error('The browser was spawned without its pipes');
    }
    return { stderr, pipe, input };
}

function readErrorReply(error: unknown): CdpErrorReply | null {
    if (!isPlainObject(error)) {
        return null;
    }
    const { code, message, data } = error;
    return {
        code: typeof code === 'number' ? code : 0,
        message: typeof message === 'string' ? message : 'The browser answered with an error',
        data: typeof data === 'string' ? data : undefined,
    };
}
