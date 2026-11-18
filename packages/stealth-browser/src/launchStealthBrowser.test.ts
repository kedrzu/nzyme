import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, test } from 'bun:test';
import { chromium } from 'playwright';

import { createTestLogger } from '@nzyme/logging/createTestLogger.js';
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';
import { waitUntil } from '@nzyme/utils/waitUntil.js';

import { launchStealthBrowser } from './launchStealthBrowser.js';
import type { StealthBrowser } from './launchStealthBrowser.js';

/**
 * These tests drive a real Chromium: Playwright's. It runs headless (no window on a dev Mac, no display on CI) and
 * without the sandbox, which CI runners do not allow.
 */
const EXECUTABLE = chromium.executablePath();
const HEADLESS_ARGS = ['--headless=new', '--no-sandbox'];
const TIMEOUT_MS = 20_000;

/** What a page and its worker read first: their `navigator.userAgentData.brands`. */
const IDENTIFY = 'const brands = navigator.userAgentData.brands.map(({ brand }) => brand);';
/** Keeps the brands the page and its worker read at their first script in `window.identities`. */
const BRAND_HTML = `<!doctype html><html><body><script>
    ${IDENTIFY}
    window.identities = { page: brands };
    const worker = new Worker(URL.createObjectURL(new Blob([${JSON.stringify(`${IDENTIFY} postMessage(brands);`)}])));
    worker.onmessage = event => { window.identities.worker = event.data; };
</script></body></html>`;

const cleanups: (() => Promise<unknown> | void)[] = [];

afterEach(async () => {
    for (const cleanup of cleanups.splice(0).toReversed()) {
        await cleanup();
    }
});

test('a page and its worker name Google Chrome from their first script', async () => {
    // Loopback is a secure context, which `navigator.userAgentData` needs.
    const server = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        fetch: () => new Response(BRAND_HTML, { headers: { 'content-type': 'text/html' } }),
    });
    cleanups.push(() => server.stop(true));
    const browser = await startBrowser();

    const created = await browser.send('Target.createTarget', { url: 'about:blank' });
    const targetId = isPlainObject(created) ? String(created['targetId']) : '';
    const sessionId = await browser.attach(targetId);
    // Not `Target.createTarget` with the URL: its first navigation can commit before the brand reaches the page.
    await browser.send('Page.navigate', { url: `http://127.0.0.1:${server.port}/` }, sessionId);

    let identities: unknown;
    await waitUntil(
        async () => {
            identities = await evaluate(browser, sessionId, 'window.identities');
            return isPlainObject(identities) && identities['worker'] != null;
        },
        { timeoutMs: TIMEOUT_MS },
    );
    const page = isPlainObject(identities) ? identities['page'] : undefined;
    expect(page).toContain('Google Chrome');
    expect(page).toContain('Chromium');
    expect(identities).toEqual({ page, worker: page });
}, 30_000);

test('an exit rejects pending calls and later sends, and settles exited', async () => {
    const browser = await startBrowser();
    const created = await browser.send('Target.createTarget', { url: 'about:blank' });
    const targetId = isPlainObject(created) ? String(created['targetId']) : '';
    const sessionId = await browser.attach(targetId);

    const call = browser.send(
        'Runtime.evaluate',
        { expression: 'new Promise(() => {})', awaitPromise: true },
        sessionId,
    );
    process.kill(browser.pid, 'SIGKILL');

    await expect(call).rejects.toThrow('The browser exited');
    expect(await browser.exited).toEqual({ code: null, signal: 'SIGKILL' });
    await expect(browser.send('Browser.getVersion')).rejects.toThrow('The browser is not running');
}, 30_000);

test('close ends the browser process', async () => {
    const browser = await startBrowser();

    await browser.close();

    expect(isAlive(browser.pid)).toBe(false);
}, 30_000);

test('a browser that does not start in time fails the launch and is killed', async () => {
    const work = await createWork();
    const pidFile = path.join(work, 'pid');
    // Never answers on the pipe: the launch can only time out.
    const executable = path.join(work, 'silent-browser.sh');
    await writeFile(executable, `#!/bin/sh\necho $$ > '${pidFile}'\nexec sleep 60\n`);
    await chmod(executable, 0o755);

    const launch = launchStealthBrowser({
        executablePath: executable,
        userDataDir: path.join(work, 'profile'),
        startTimeoutMs: 500,
        logger: createTestLogger('test').logger,
    });

    await expect(launch).rejects.toThrow('The browser did not start in time');
    const pid = Number(await readFile(pidFile, 'utf8'));
    expect(isAlive(pid)).toBe(false);
}, 10_000);

async function startBrowser() {
    const work = await createWork();
    const browser = await launchStealthBrowser({
        executablePath: EXECUTABLE,
        userDataDir: path.join(work, 'profile'),
        args: HEADLESS_ARGS,
        logger: createTestLogger('test').logger,
    });
    cleanups.push(() => browser.close());
    return browser;
}

async function createWork() {
    const work = await mkdtemp(path.join(os.tmpdir(), 'stealth-browser-'));
    cleanups.push(() => rm(work, { recursive: true, force: true }));
    return work;
}

async function evaluate(browser: StealthBrowser, sessionId: string, expression: string) {
    const reply = await browser.send('Runtime.evaluate', { expression, returnByValue: true }, sessionId);
    const result = isPlainObject(reply) ? reply['result'] : undefined;
    return isPlainObject(result) ? result['value'] : undefined;
}

function isAlive(pid: number) {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}
