import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, test } from 'bun:test';
import { chromium } from 'playwright';

import { createTestLogger } from '@nzyme/logging/createTestLogger.js';
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';
import { waitUntil } from '@nzyme/utils/waitUntil.js';

import type { CdpSocket } from './CdpTypes.js';
import { createSitePace } from './createSitePace.js';
import type { SitePace } from './createSitePace.js';
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

/** Pages a client serves itself through `Fetch` (`servePages`), so they never reach the network. */
const DETECTOR_URL = 'https://detector.test/';
/** The detector on another site, hence in another renderer process. */
const OTHER_SITE_URL = 'https://other-site.test/';
/** The detector with two frames: one of its own origin, and one of another origin of its site, hence its process. */
const FRAMES_URL = 'https://detector.test/frames';
const SAME_ORIGIN_FRAME_URL = 'https://detector.test/frame';
const CROSS_ORIGIN_FRAME_URL = 'https://detector.test:8443/frame';
const WORKER_URL = 'https://detector.test/worker';
/** A page that has its own frame, a worker and a service worker report the identity each reads at its first script. */
const BRANDED_URL = 'https://brand.test/';
/** The same page, which also registers a service worker. */
const BRANDED_SERVICE_WORKER_PAGE_URL = 'https://brand.test/?service-worker';
const BRANDED_FRAME_URL = 'https://brand.test/frame';
const BRANDED_SERVICE_WORKER_URL = 'https://brand.test/service-worker.js';
/** A site the pace keeps; its `www.` page answers 403, a block. */
const SHOP_URL = 'https://shop.test/';
const SHOP_BLOCKED_URL = 'https://www.shop.test/blocked';
/** The pace's refusal of the shop for 5 minutes after its block. */
const SHOP_PAUSED =
    'shop.test is paced after it blocked or challenged the browser: the next action on it is possible in 5 min.';
/**
 * The page's own detector, after rebrowser's bot-detector: an Error logged with `console.debug` is serialised only
 * while Runtime is enabled, which formats its stack through `Error.prepareStackTrace`. (Its `name` is read either way,
 * by Chrome's own console logging, so a getter on it detects nothing.) It also looks for the globals the client's code
 * sets and counts main-world `querySelector` calls, and writes what it saw to the DOM, where the client reads it.
 */
const DETECTOR_HTML = detectorHtml('');
/** A framed page's own detector: whether the client's global reached the frame's world, in `#mark`. */
const FRAME_HTML = `<!doctype html><html><body><p id="mark"></p><script>
    setInterval(() => { document.getElementById('mark').textContent = '__fnMark' in window ? 'seen' : 'clean'; }, 50);
</script></body></html>`;
/** A page with a worker; what the worker posts lands in `data-worker`: `alive` at start, `reached` if code reaches it. */
const WORKER_HTML = `<!doctype html><html><body><script>
    const worker = new Worker(URL.createObjectURL(new Blob(["postMessage('alive'); self.reach = () => postMessage('reached');"])));
    worker.onmessage = event => { document.body.dataset.worker = event.data; };
</script></body></html>`;
/** What a page, its frame and its workers read first: their `navigator.userAgentData.brands` and user agent. */
const IDENTIFY_ALL =
    'const identity = { brands: navigator.userAgentData.brands.map(({ brand, version }) => ({ brand, version })), userAgent: navigator.userAgent };';
/** Writes every identity it gathers to `#identities`: of the page, its `frame`, `worker` and `serviceWorker`. */
const BRANDED_HTML = `<!doctype html><html><body><pre id="identities"></pre><script>
    ${IDENTIFY_ALL}
    window.identities = { page: identity };
    window.show = () => { document.getElementById('identities').textContent = JSON.stringify(window.identities); };
    const worker = new Worker(URL.createObjectURL(new Blob([${JSON.stringify(`${IDENTIFY_ALL} postMessage(identity);`)}])));
    worker.onmessage = event => { window.identities.worker = event.data; show(); };
    navigator.serviceWorker.onmessage = event => { window.identities.serviceWorker = event.data; show(); };
    if (location.search === '?service-worker') navigator.serviceWorker.register('/service-worker.js').then(() => navigator.serviceWorker.ready).then(registration => registration.active.postMessage('identify'));
</script><iframe src="/frame"></iframe></body></html>`;
const BRANDED_FRAME_HTML = `<!doctype html><html><body><script>${IDENTIFY_ALL} parent.identities.frame = identity; parent.show();</script></body></html>`;
const BRANDED_SERVICE_WORKER = `${IDENTIFY_ALL}
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('message', event => event.source.postMessage(identity));`;
/** How many pages the brand of a page opened with a URL is checked on: it once failed 2 runs of 6. */
const OPENED_WITH_URL_RUNS = 6;

/** What `DETECTOR_HTML` writes to its page. */
interface DetectorFindings {
    /** How often a logged Error's stack was formatted: above 0 only while Runtime is enabled. */
    runtime: number;
    /** The client's globals the page can see. */
    globals: string[];
    /** Main-world `document.querySelector` calls. */
    querySelector: number;
}

/** A client connected through `connect`, as a WebSocket client is one. */
interface TestClient {
    /** Every message the proxy sent, parsed. */
    messages: Record<string, unknown>[];
    /** Calls `listener` with every message the proxy sends from now on. */
    onMessage(listener: (message: Record<string, unknown>) => void): void;
    /** Sends a command; resolves with its result, rejects with its error message. */
    call(method: string, params?: object, sessionId?: string): Promise<unknown>;
    /** Settles with the code and reason the proxy closed the socket with. */
    closed: Promise<[number | undefined, string | undefined]>;
}

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
    // Attaching waits for the brand of the new page: navigated before it, the page could read Chromium under load.
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
    // Never answers on the pipe: the launch can only time out.
    const executable = path.join(work, 'silent-browser.sh');
    await writeFile(executable, '#!/bin/sh\nexec sleep 60\n');
    await chmod(executable, 0o755);
    const { logger, logs } = createTestLogger('test');

    const launch = launchStealthBrowser({
        executablePath: executable,
        userDataDir: path.join(work, 'profile'),
        startTimeoutMs: 500,
        logger,
    });

    await expect(launch).rejects.toThrow('The browser did not start in time');
    // The pid of the spawned process, as the launch logged it: the stub may not have run a line yet under load.
    const pid = logs.find(log => log.message === 'The browser could not be configured')?.data?.['pid'];
    expect(typeof pid).toBe('number');
    expect(isAlive(Number(pid))).toBe(false);
}, 10_000);

test('a page script sees no enabled Runtime and nothing the client runs, while the client reads the page', async () => {
    const browser = await startBrowser();
    const client = connectClient(browser, 'group-a');
    const targetId = await createTarget(client);
    const sessionId = await attachClient(client, targetId);
    await servePages(client, sessionId, { [DETECTOR_URL]: DETECTOR_HTML, [OTHER_SITE_URL]: DETECTOR_HTML });

    // What a CDP client like agent-browser sends: the enables, init scripts, then evaluation in every form.
    await client.call('Runtime.enable', {}, sessionId);
    await client.call('Console.enable', {}, sessionId);
    await client.call('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__initMark = 1;' }, sessionId);
    await expect(
        client.call('Page.addScriptToEvaluateOnLoad', { scriptSource: 'window.__loadMark = 1;' }, sessionId),
    ).rejects.toThrow('use Page.addScriptToEvaluateOnNewDocument');
    await expect(client.call('Runtime.addBinding', { name: '__clientBinding' }, sessionId)).rejects.toThrow(
        "page code must not call the client's functions",
    );
    await navigate(client, sessionId, DETECTOR_URL);
    expect(
        await evaluateIn(client, sessionId, "window.__agentMark = 1; document.querySelector('h1').textContent"),
    ).toBe('Detector');
    expect(await evaluateIn(client, sessionId, '[window.__initMark, window.__loadMark]')).toEqual([1, null]);
    const tree = await client.call('DOM.getDocument', {}, sessionId);
    const root = isPlainObject(tree) && isPlainObject(tree['root']) ? tree['root']['nodeId'] : undefined;
    const found = await client.call('DOM.querySelector', { nodeId: root, selector: 'h1' }, sessionId);
    const resolved = await client.call(
        'DOM.resolveNode',
        { nodeId: isPlainObject(found) ? found['nodeId'] : undefined },
        sessionId,
    );
    const objectId =
        isPlainObject(resolved) && isPlainObject(resolved['object']) ? resolved['object']['objectId'] : null;
    const called = await client.call(
        'Runtime.callFunctionOn',
        {
            objectId,
            functionDeclaration: 'function () { window.__fnMark = 1; return this.tagName; }',
            returnByValue: true,
        },
        sessionId,
    );
    expect(isPlainObject(called) && isPlainObject(called['result']) ? called['result']['value'] : null).toBe('H1');
    // A world of the client's own, as agent-browser's a11y audit creates it, evaluated in by the id it was given.
    const frameTree = await client.call('Page.getFrameTree', {}, sessionId);
    const frame =
        isPlainObject(frameTree) && isPlainObject(frameTree['frameTree']) ? frameTree['frameTree']['frame'] : undefined;
    const world = await client.call(
        'Page.createIsolatedWorld',
        { frameId: isPlainObject(frame) ? frame['id'] : undefined, worldName: 'own', grantUniveralAccess: true },
        sessionId,
    );
    const contextId = isPlainObject(world) ? world['executionContextId'] : undefined;
    expect(typeof contextId).toBe('number');
    // The detector sets `Error.prepareStackTrace` in the page's own world only.
    const inOwnWorld =
        "[document.querySelector('h1').textContent, typeof Error.prepareStackTrace, typeof window.__ownMark]";
    expect(await evaluateIn(client, sessionId, `window.__ownMark = 1; ${inOwnWorld}`, { contextId })).toEqual([
        'Detector',
        'undefined',
        'number',
    ]);
    // Any other id is refused: ids are reused across renderer processes, so it may name the page's own world.
    for (const forged of [1, Number(contextId) + 1]) {
        await expect(
            client.call('Runtime.evaluate', { expression: '1', contextId: forged }, sessionId),
        ).rejects.toThrow('must name one you created');
    }

    // A cross-site navigation in between: the next evaluation lands in the new document's world, where the init script
    // ran, and the client's id still names its own world there, not whatever context the id now belongs to.
    await navigate(client, sessionId, OTHER_SITE_URL);
    expect(await evaluateIn(client, sessionId, '[window.__initMark, typeof window.__agentMark]')).toEqual([
        1,
        'undefined',
    ]);
    expect(await evaluateIn(client, sessionId, inOwnWorld, { contextId })).toEqual([
        'Detector',
        'undefined',
        'undefined',
    ]);
    await Bun.sleep(300);
    const clean: DetectorFindings = { runtime: 0, globals: [], querySelector: 0 };
    expect(await readDetections(client, sessionId)).toEqual(clean);

    // The control: the detector does catch an enabled Runtime, here enabled by the browser's owner past the proxy.
    await browser.send('Runtime.enable', {}, await browser.attach(targetId));
    await waitUntil(async () => isDetected(await readDetections(client, sessionId)), { timeoutMs: TIMEOUT_MS });
}, 30_000);

test('a node of a framed page resolves into its own frame, out of reach of every page script', async () => {
    const browser = await startBrowser();
    const client = connectClient(browser, 'group-a');
    const targetId = await createTarget(client);
    const sessionId = await attachClient(client, targetId);
    await servePages(client, sessionId, {
        [FRAMES_URL]: detectorHtml(`<iframe src="/frame"></iframe><iframe src="${CROSS_ORIGIN_FRAME_URL}"></iframe>`),
        [SAME_ORIGIN_FRAME_URL]: FRAME_HTML,
        [CROSS_ORIGIN_FRAME_URL]: FRAME_HTML,
    });
    await navigate(client, sessionId, FRAMES_URL);

    // agent-browser's refs: a backendNodeId, resolved with no context, then a function called on the object.
    const tree = await client.call('DOM.getDocument', { depth: -1, pierce: true }, sessionId);
    const marks = findNodes(isPlainObject(tree) ? tree['root'] : undefined, node => {
        const attributes = node['attributes'];
        return Array.isArray(attributes) && attributes[0] === 'id' && attributes[1] === 'mark';
    });
    expect(marks).toHaveLength(2);
    const seen: unknown[] = [];
    for (const backendNodeId of marks) {
        seen.push(
            await callOnNode(
                client,
                sessionId,
                backendNodeId,
                'function () { window.__fnMark = 1; return document.URL; }',
            ),
        );
    }
    expect(seen).toEqual([SAME_ORIGIN_FRAME_URL, CROSS_ORIGIN_FRAME_URL]);

    await Bun.sleep(300);
    const marked: unknown[] = [];
    for (const backendNodeId of marks) {
        marked.push(await callOnNode(client, sessionId, backendNodeId, 'function () { return this.textContent; }'));
    }
    expect(marked).toEqual(['clean', 'clean']);
    const clean: DetectorFindings = { runtime: 0, globals: [], querySelector: 0 };
    expect(await readDetections(client, sessionId)).toEqual(clean);
}, 30_000);

test("code sent to a worker's session never reaches the worker", async () => {
    const browser = await startBrowser();
    const client = connectClient(browser, 'group-a');
    const targetId = await createTarget(client);
    const sessionId = await attachClient(client, targetId);
    await servePages(client, sessionId, { [WORKER_URL]: WORKER_HTML });
    await navigate(client, sessionId, WORKER_URL);
    await waitUntil(async () => (await evaluateIn(client, sessionId, 'document.body.dataset.worker')) === 'alive', {
        timeoutMs: TIMEOUT_MS,
    });

    await client.call(
        'Target.setAutoAttach',
        { autoAttach: true, waitForDebuggerOnStart: false, flatten: true },
        sessionId,
    );
    await waitUntil(() => findWorkerSession(client) != null, { timeoutMs: TIMEOUT_MS });
    const workerSession = findWorkerSession(client);
    await expect(client.call('Runtime.evaluate', { expression: 'reach()' }, workerSession)).rejects.toThrow(
        'cannot run in a worker',
    );

    await Bun.sleep(300);
    expect(await evaluateIn(client, sessionId, 'document.body.dataset.worker')).toBe('alive');
}, 30_000);

test('two clients of a group see its pages but not each other sessions', async () => {
    const browser = await startBrowser();
    const first = connectClient(browser, 'group-a');
    const targetId = await createTarget(first);
    const firstSession = await attachClient(first, targetId);
    await first.call('Page.enable', {}, firstSession);

    const second = connectClient(browser, 'group-a');
    await second.call('Target.setDiscoverTargets', { discover: true });
    await first.call('Page.navigate', { url: 'about:blank' }, firstSession);

    expect(createdTargets(second)).toEqual([targetId]);
    expect(targetIdsOf(await second.call('Target.getTargets'))).toEqual([targetId]);
    await expect(second.call('Runtime.evaluate', { expression: '1' }, firstSession)).rejects.toThrow('unknown session');
    await expect(second.call('Target.detachFromTarget', { sessionId: firstSession })).rejects.toThrow(
        'unknown session',
    );
    const secondSession = await attachClient(second, targetId);
    expect(await evaluateIn(second, secondSession, '6 * 7')).toBe(42);
    expect(mentions(second, firstSession)).toBe(false);
    expect(mentions(first, secondSession)).toBe(false);
}, 30_000);

test('clients of two groups see and drive only their own pages', async () => {
    const browser = await startBrowser();
    const a = connectClient(browser, 'group-a');
    const b = connectClient(browser, 'group-b');
    await a.call('Target.setDiscoverTargets', { discover: true });
    await b.call('Target.setDiscoverTargets', { discover: true });

    const targetA = await createTarget(a);
    const targetB = await createTarget(b);
    const sessionA = await attachClient(a, targetA);
    await a.call('Page.enable', {}, sessionA);

    expect(browser.groups.targets('group-a')).toEqual([targetA]);
    expect(targetIdsOf(await a.call('Target.getTargets'))).toEqual([targetA]);
    expect(targetIdsOf(await b.call('Target.getTargets'))).toEqual([targetB]);
    await expect(a.call('Target.attachToTarget', { targetId: targetB, flatten: true })).rejects.toThrow(
        'unknown target',
    );
    await expect(a.call('Target.closeTarget', { targetId: targetB })).rejects.toThrow('unknown target');
    await expect(b.call('Runtime.evaluate', { expression: '1' }, sessionA)).rejects.toThrow('unknown session');

    expect(createdTargets(a)).toEqual([targetA]);
    expect(createdTargets(b)).toEqual([targetB]);
    expect(mentions(b, targetA)).toBe(false);
    expect(mentions(b, sessionA)).toBe(false);
    expect(mentions(a, targetB)).toBe(false);
}, 30_000);

test('a page, its frame, its worker and its service worker all name Google Chrome from their first script', async () => {
    const browser = await startBrowser();
    const client = connectClient(browser, 'group-a');
    const version = await client.call('Browser.getVersion');
    const product = isPlainObject(version) ? String(version['product']) : '';
    const major = product.replace(/^\w+\//, '').split('.')[0] ?? '';
    const targetId = await createTarget(client);
    const sessionId = await attachClient(client, targetId);
    await servePages(client, sessionId, {
        [BRANDED_URL]: BRANDED_HTML,
        [BRANDED_SERVICE_WORKER_PAGE_URL]: BRANDED_HTML,
        [BRANDED_FRAME_URL]: BRANDED_FRAME_HTML,
        [BRANDED_SERVICE_WORKER_URL]: BRANDED_SERVICE_WORKER,
    });

    for (const method of ['Emulation.setUserAgentOverride', 'Network.setUserAgentOverride']) {
        await expect(client.call(method, { userAgent: 'Bot/1.0' }, sessionId)).rejects.toThrow(
            "the browser's identity is set by the proxy",
        );
    }
    // No hold of the client's own here: only the proxy's keeps the page from running ahead of the brand.
    await navigate(client, sessionId, BRANDED_URL);
    const { page, frame, worker } = await readIdentities(
        client,
        sessionId,
        ids => ids['frame'] != null && ids['worker'] != null,
    );
    const brands = isPlainObject(page) ? page['brands'] : undefined;
    expect(brands).toContainEqual({ brand: 'Google Chrome', version: major });
    expect(brands).toContainEqual({ brand: 'Chromium', version: major });
    expect({ frame, worker }).toEqual({ frame: page, worker: page });

    // As agent-browser does: hold every child target and let it go once set up. The service worker's script is served
    // on its own session, which the page's interception does not cover.
    client.onMessage(message => {
        if (message['method'] !== 'Target.attachedToTarget') {
            return;
        }
        const params = isPlainObject(message['params']) ? message['params'] : {};
        const child = String(params['sessionId']);
        const type = isPlainObject(params['targetInfo']) ? params['targetInfo']['type'] : undefined;
        const setUp =
            type === 'service_worker'
                ? client.call('Fetch.enable', { patterns: [{ urlPattern: 'https://*.test*' }] }, child)
                : Promise.resolve();
        // A short-lived child can be gone before its commands arrive.
        setUp.then(() => client.call('Runtime.runIfWaitingForDebugger', {}, child)).catch(() => {});
    });
    await client.call(
        'Target.setAutoAttach',
        { autoAttach: true, waitForDebuggerOnStart: true, flatten: true },
        sessionId,
    );
    await navigate(client, sessionId, BRANDED_SERVICE_WORKER_PAGE_URL);
    const { serviceWorker } = await readIdentities(client, sessionId, ids => ids['serviceWorker'] != null);
    expect(serviceWorker).toEqual(page);
}, 30_000);

test('a page a client opens with a URL names Google Chrome from its first script, every time', async () => {
    // Loopback is a secure context, which `navigator.userAgentData` needs; the page loads before anyone attaches.
    const server = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        fetch: () => new Response(BRAND_HTML, { headers: { 'content-type': 'text/html' } }),
    });
    cleanups.push(() => server.stop(true));
    const browser = await startBrowser();
    const client = connectClient(browser, 'group-a');

    const seen: unknown[] = [];
    for (let run = 0; run < OPENED_WITH_URL_RUNS; run++) {
        const reply = await client.call('Target.createTarget', { url: `http://127.0.0.1:${server.port}/?run=${run}` });
        expect(Object.keys(isPlainObject(reply) ? reply : {})).toEqual(['targetId']);
        // Read in the page's own world, where its script keeps them: the owner's session reaches it, a client's not.
        const sessionId = await browser.attach(isPlainObject(reply) ? String(reply['targetId']) : '');
        let identities: unknown;
        await waitUntil(
            async () => {
                identities = await evaluate(browser, sessionId, 'window.identities');
                return isPlainObject(identities) && identities['worker'] != null;
            },
            { timeoutMs: TIMEOUT_MS },
        );
        seen.push(identities);
    }

    for (const identities of seen) {
        const page = isPlainObject(identities) ? identities['page'] : undefined;
        expect(page).toContain('Google Chrome');
        expect(identities).toEqual({ page, worker: page });
    }
}, 60_000);

test('a browser exit closes every client socket', async () => {
    const browser = await startBrowser();
    const a = connectClient(browser, 'group-a');
    const b = connectClient(browser);
    await a.call('Browser.getVersion');

    process.kill(browser.pid, 'SIGKILL');

    expect(await a.closed).toEqual([1011, 'The browser exited']);
    expect(await b.closed).toEqual([1011, 'The browser exited']);
}, 30_000);

test('a held command keeps its session order, and after a block the site is refused with the reason', async () => {
    const browser = await startBrowser(createSitePace());
    const client = connectClient(browser);
    const sessionId = await attachClient(client, await createTarget(client));
    await servePages(
        client,
        sessionId,
        { [SHOP_URL]: DETECTOR_HTML, [SHOP_BLOCKED_URL]: DETECTOR_HTML },
        { [SHOP_BLOCKED_URL]: 403 },
    );
    await client.call('Network.enable', {}, sessionId);
    await navigate(client, sessionId, SHOP_URL);

    const startedAt = Date.now();
    const replies: string[] = [];
    const loads = client.messages.filter(m => m['method'] === 'Page.loadEventFired').length;
    const held = client
        .call('Page.navigate', { url: SHOP_BLOCKED_URL }, sessionId)
        .then(() => replies.push('navigate'));
    const after = evaluateIn(client, sessionId, '1').then(() => replies.push('evaluate'));
    await Promise.all([held, after]);
    expect(replies).toEqual(['navigate', 'evaluate']);
    expect(Date.now() - startedAt).toBeGreaterThan(4000);
    await waitUntil(() => client.messages.filter(m => m['method'] === 'Page.loadEventFired').length > loads, {
        timeoutMs: TIMEOUT_MS,
    });

    await expect(client.call('Page.navigate', { url: SHOP_URL }, sessionId)).rejects.toThrow(SHOP_PAUSED);
}, 30_000);

test("a site's block outlives the browser: the next one launched with the same pace refuses it too", async () => {
    const pace = createSitePace();
    const first = await startBrowser(pace);
    const client = connectClient(first, 'group-a');
    const sessionId = await attachClient(client, await createTarget(client));
    await servePages(client, sessionId, { [SHOP_BLOCKED_URL]: DETECTOR_HTML }, { [SHOP_BLOCKED_URL]: 403 });
    await client.call('Network.enable', {}, sessionId);
    await navigate(client, sessionId, SHOP_BLOCKED_URL);
    await expect(client.call('Page.navigate', { url: SHOP_URL }, sessionId)).rejects.toThrow(SHOP_PAUSED);
    await first.close();

    const next = connectClient(await startBrowser(pace), 'group-a');
    await expect(next.call('Target.createTarget', { url: SHOP_URL })).rejects.toThrow(SHOP_PAUSED);
}, 30_000);

async function startBrowser(pace?: SitePace) {
    const work = await createWork();
    const browser = await launchStealthBrowser({
        executablePath: EXECUTABLE,
        userDataDir: path.join(work, 'profile'),
        args: HEADLESS_ARGS,
        pace,
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

/** Connects a client the way a WebSocket server would, feeding it what the test sends. */
function connectClient(browser: StealthBrowser, group?: string): TestClient {
    const messages: Record<string, unknown>[] = [];
    const listeners: ((message: Record<string, unknown>) => void)[] = [];
    const pending = new Map<number, PromiseWithResolvers<unknown>>();
    const { promise: closed, resolve: markClosed } = Promise.withResolvers<[number | undefined, string | undefined]>();
    let lastId = 0;
    const socket: CdpSocket = {
        send(text) {
            const message: unknown = JSON.parse(text);
            if (!isPlainObject(message)) {
                return;
            }
            messages.push(message);
            for (const listener of listeners) {
                listener(message);
            }
            const id = message['id'];
            const call = typeof id === 'number' ? pending.get(id) : undefined;
            const error = message['error'];
            if (isPlainObject(error)) {
                call?.reject(new Error(String(error['message'])));
            } else {
                call?.resolve(message['result']);
            }
        },
        close: (code, reason) => markClosed([code, reason]),
    };
    const client = browser.connect(socket, { group, data: undefined });
    cleanups.push(() => client.close());

    return {
        messages,
        closed,
        onMessage: listener => listeners.push(listener),
        call(method, params, sessionId) {
            const id = ++lastId;
            const call = Promise.withResolvers<unknown>();
            pending.set(id, call);
            client.receive(JSON.stringify({ id, method, params: params ?? {}, sessionId }));
            return call.promise;
        },
    };
}

async function createTarget(client: TestClient) {
    const reply = await client.call('Target.createTarget', { url: 'about:blank' });
    const targetId = isPlainObject(reply) ? reply['targetId'] : undefined;
    if (typeof targetId !== 'string') {
        throw new TypeError('Target.createTarget gave no target id');
    }
    return targetId;
}

async function attachClient(client: TestClient, targetId: string) {
    const reply = await client.call('Target.attachToTarget', { targetId, flatten: true });
    const sessionId = isPlainObject(reply) ? reply['sessionId'] : undefined;
    if (typeof sessionId !== 'string') {
        throw new TypeError('Target.attachToTarget gave no session id');
    }
    return sessionId;
}

async function evaluateIn(client: TestClient, sessionId: string, expression: string, extra: object = {}) {
    const reply = await client.call('Runtime.evaluate', { expression, returnByValue: true, ...extra }, sessionId);
    const result = isPlainObject(reply) ? reply['result'] : undefined;
    return isPlainObject(result) ? result['value'] : undefined;
}

/**
 * Intercepts the page's requests on `sessionId` with `Fetch` and answers each from `pages` by URL, with its status in
 * `statuses` (200 by default), a 404 the rest; enables Page for its load events.
 */
async function servePages(
    client: TestClient,
    sessionId: string,
    pages: Record<string, string>,
    statuses: Record<string, number> = {},
) {
    client.onMessage(message => {
        if (message['method'] !== 'Fetch.requestPaused' || !isPlainObject(message['params'])) {
            return;
        }
        const { requestId, request } = message['params'];
        const pausedOn = typeof message['sessionId'] === 'string' ? message['sessionId'] : sessionId;
        const url = isPlainObject(request) ? request['url'] : undefined;
        const html = typeof url === 'string' && Object.hasOwn(pages, url) ? pages[url] : undefined;
        void client.call(
            'Fetch.fulfillRequest',
            {
                requestId,
                responseCode: html == null ? 404 : (statuses[String(url)] ?? 200),
                responseHeaders: [
                    {
                        name: 'Content-Type',
                        value: typeof url === 'string' && url.endsWith('.js') ? 'text/javascript' : 'text/html',
                    },
                ],
                body: Buffer.from(html ?? '').toString('base64'),
            },
            pausedOn,
        );
    });
    await client.call('Fetch.enable', { patterns: [{ urlPattern: 'https://*.test*' }] }, sessionId);
    await client.call('Page.enable', {}, sessionId);
}

async function navigate(client: TestClient, sessionId: string, url: string) {
    const loads = client.messages.filter(m => m['method'] === 'Page.loadEventFired').length;
    await client.call('Page.navigate', { url }, sessionId);
    await waitUntil(() => client.messages.filter(m => m['method'] === 'Page.loadEventFired').length > loads, {
        timeoutMs: TIMEOUT_MS,
    });
}

/** The detector page, with `body` after it. */
function detectorHtml(body: string) {
    return `<!doctype html><html><body><h1>Detector</h1><pre id="detections"></pre>${body}<script>
    const detections = { runtime: 0, globals: [], querySelector: 0 };
    const querySelector = Document.prototype.querySelector;
    Document.prototype.querySelector = function (...args) { detections.querySelector++; return querySelector.apply(this, args); };
    Error.prepareStackTrace = (error, frames) => { detections.runtime++; return 'stack'; };
    setInterval(() => {
        console.debug(new Error('probe'));
        detections.globals = ['__agentMark', '__initMark', '__loadMark', '__fnMark', '__ownMark'].filter(
            name => name in window,
        );
        document.getElementById('detections').textContent = JSON.stringify(detections);
    }, 50);
</script></body></html>`;
}

/** What the detector page last wrote; `null` before it wrote anything. */
async function readDetections(client: TestClient, sessionId: string) {
    const text = await evaluateIn(client, sessionId, "document.getElementById('detections').textContent");
    if (typeof text !== 'string' || text === '') {
        return null;
    }
    const findings: unknown = JSON.parse(text);
    return findings;
}

function isDetected(findings: unknown) {
    return isPlainObject(findings) && typeof findings['runtime'] === 'number' && findings['runtime'] > 0;
}

/** What `BRANDED_HTML` wrote to its page, once `isComplete` says it holds everything the test waits for. */
async function readIdentities(
    client: TestClient,
    sessionId: string,
    isComplete: (identities: Record<string, unknown>) => boolean,
) {
    let identities: Record<string, unknown> = {};
    await waitUntil(
        async () => {
            const text = await evaluateIn(client, sessionId, "document.getElementById('identities').textContent");
            const parsed: unknown = typeof text === 'string' && text !== '' ? JSON.parse(text) : {};
            identities = isPlainObject(parsed) ? parsed : {};
            return isComplete(identities);
        },
        { timeoutMs: TIMEOUT_MS },
    );
    return identities;
}

/** Resolves a node as agent-browser does, with no context, and calls `functionDeclaration` on it; its value. */
async function callOnNode(client: TestClient, sessionId: string, backendNodeId: number, functionDeclaration: string) {
    const resolved = await client.call('DOM.resolveNode', { backendNodeId }, sessionId);
    const objectId =
        isPlainObject(resolved) && isPlainObject(resolved['object']) ? resolved['object']['objectId'] : undefined;
    const called = await client.call(
        'Runtime.callFunctionOn',
        { objectId, functionDeclaration, returnByValue: true },
        sessionId,
    );
    return isPlainObject(called) && isPlainObject(called['result']) ? called['result']['value'] : undefined;
}

/** The backendNodeIds of the nodes `matches` picks in a `DOM.getDocument` tree, frames' documents included. */
function findNodes(root: unknown, matches: (node: Record<string, unknown>) => boolean) {
    const found: number[] = [];
    const pending: unknown[] = [root];
    while (pending.length > 0) {
        const node = pending.shift();
        if (!isPlainObject(node)) {
            continue;
        }
        if (matches(node) && typeof node['backendNodeId'] === 'number') {
            found.push(node['backendNodeId']);
        }
        const children = node['children'];
        if (Array.isArray(children)) {
            const list: readonly unknown[] = children;
            pending.push(...list);
        }
        pending.push(node['contentDocument']);
    }
    return found;
}

/** The session a client was auto-attached to a worker on. */
function findWorkerSession(client: TestClient) {
    for (const message of client.messages) {
        const params = message['params'];
        if (
            message['method'] === 'Target.attachedToTarget' &&
            isPlainObject(params) &&
            isPlainObject(params['targetInfo']) &&
            params['targetInfo']['type'] === 'worker' &&
            typeof params['sessionId'] === 'string'
        ) {
            return params['sessionId'];
        }
    }
    return undefined;
}

function targetIdsOf(reply: unknown) {
    const infos = isPlainObject(reply) && Array.isArray(reply['targetInfos']) ? reply['targetInfos'] : [];
    return infos.map((info: unknown) => (isPlainObject(info) ? info['targetId'] : undefined));
}

/** The targets a client was told were created, in order. */
function createdTargets(client: TestClient) {
    return client.messages
        .filter(m => m['method'] === 'Target.targetCreated')
        .map(m =>
            isPlainObject(m['params']) && isPlainObject(m['params']['targetInfo'])
                ? m['params']['targetInfo']['targetId']
                : undefined,
        );
}

/** Whether any event a client got names `id` (a target or a session) anywhere; replies echo what the client sent. */
function mentions(client: TestClient, id: string) {
    return client.messages.some(m => m['method'] != null && JSON.stringify(m).includes(id));
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
