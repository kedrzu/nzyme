import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { createContainer } from '@nzyme/ioc/Container.js';
import { createLogger, setLoggerTransport } from '@nzyme/logging/createLogger.js';
import { LoggerTransport } from '@nzyme/logging/LoggerTransport.js';
import { PrettyCliLoggerTransport } from '@nzyme/logging/PrettyCliLoggerTransport.js';

import { createSitePace } from './createSitePace.js';
import { findChrome } from './findChrome.js';
import { installChromeForTesting } from './installChromeForTesting.js';
import { serveStealthBrowser } from './serveStealthBrowser.js';

const USAGE = `Usage: stealth-browser [--chrome <path> | --chrome-for-testing [--chrome-version <v>]]
                       [--user-data-dir <dir>] [--port <n>] [--no-pace] [-- <chrome args>]

Launches a stealth Chrome and prints its CDP endpoint (ws://127.0.0.1:<port>/<token>) as the only line on stdout.

  --chrome <path>           the Chrome binary; installed Google Chrome by default
  --chrome-for-testing      install (once) and use the pinned Chrome for Testing
  --chrome-version <v>      another Chrome for Testing version, downloaded unverified
  --user-data-dir <dir>     the browser profile; a persistent one in this computer's app data by default
  --port <n>                the local port; any free one by default
  --no-pace                 do not hold sites to a human pace
  -- <chrome args>          passed to Chrome as they are`;

/** The folder this CLI keeps its profile and Chrome for Testing in. */
const DATA_FOLDER = 'nzyme-stealth-browser';

setLoggerTransport(createCliTransport());
const logger = createLogger('stealth-browser');

try {
    await run();
} catch (error) {
    logger.error('The stealth browser failed to start', { error });
    process.exit(1);
}

async function run() {
    const separator = process.argv.indexOf('--', 2);
    const ownArgs = separator === -1 ? process.argv.slice(2) : process.argv.slice(2, separator);
    const chromeArgs = separator === -1 ? [] : process.argv.slice(separator + 1);
    const { values } = parseArgs({
        args: ownArgs,
        options: {
            chrome: { type: 'string' },
            'chrome-for-testing': { type: 'boolean' },
            'chrome-version': { type: 'string' },
            'user-data-dir': { type: 'string' },
            port: { type: 'string' },
            'no-pace': { type: 'boolean' },
            help: { type: 'boolean', short: 'h' },
        },
    });
    if (values.help) {
        console.error(USAGE);
        return;
    }
    if (values.chrome != null && values['chrome-for-testing']) {
        throw new Error('--chrome and --chrome-for-testing exclude each other');
    }
    if (values['chrome-version'] != null && !values['chrome-for-testing']) {
        throw new Error('--chrome-version needs --chrome-for-testing');
    }

    const dataDir = getDataDir();
    const server = await serveStealthBrowser({
        executablePath: await resolveChrome({
            chrome: values.chrome,
            chromeForTesting: values['chrome-for-testing'] === true,
            version: values['chrome-version'],
            dataDir,
        }),
        userDataDir: values['user-data-dir'] ?? path.join(dataDir, 'profile'),
        args: chromeArgs,
        port: values.port == null ? undefined : parsePort(values.port),
        pace: values['no-pace'] ? undefined : createSitePace(),
        logger,
    });
    process.stdout.write(`${server.endpoint}\n`);

    let closing = false;
    process.once('SIGINT', close);
    process.once('SIGTERM', close);

    const exit = await server.browser.exited;
    await server.close();
    if (!closing) {
        logger.error('Chrome exited', { code: exit.code, signal: exit.signal });
        process.exit(1);
    }
    process.exit(0);

    function close() {
        closing = true;
        void server.close();
    }
}

/** How the CLI was asked to pick Chrome. */
interface ResolveChromeParams {
    chrome: string | undefined;
    chromeForTesting: boolean;
    version: string | undefined;
    dataDir: string;
}

async function resolveChrome(params: ResolveChromeParams) {
    if (params.chrome != null) {
        return params.chrome;
    }
    if (params.chromeForTesting) {
        const installed = await installChromeForTesting({
            cacheDir: path.join(params.dataDir, 'chrome-for-testing'),
            version: params.version,
            logger,
        });
        return installed.executablePath;
    }

    const chrome = findChrome();
    if (!chrome) {
        throw new Error('Google Chrome is not installed: install it, or pass --chrome <path> or --chrome-for-testing');
    }
    return chrome;
}

function parsePort(value: string) {
    const port = Number(value);
    if (!Number.isInteger(port) || port < 0 || port > 65_535) {
        throw new Error(`--port is not a port: ${value}`);
    }
    return port;
}

/** This computer's per-user app data folder for the CLI. */
function getDataDir() {
    switch (process.platform) {
        case 'darwin':
            return path.join(os.homedir(), 'Library', 'Application Support', DATA_FOLDER);
        case 'win32':
            return path.join(process.env['LOCALAPPDATA'] ?? path.join(os.homedir(), 'AppData', 'Local'), DATA_FOLDER);
        default:
            return path.join(process.env['XDG_DATA_HOME'] ?? path.join(os.homedir(), '.local', 'share'), DATA_FOLDER);
    }
}

/** Logs go to stderr: stdout carries only the endpoint, which callers read. */
function createCliTransport() {
    const container = createContainer();
    container.register(PrettyCliLoggerTransport);
    return container.resolve(LoggerTransport);
}
