import { expect, mock, test } from 'bun:test';

import { createTestLogger } from '@nzyme/logging/createTestLogger.js';
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

import type { CdpPolicy, CdpRequest } from './CdpTypes.js';
import { connectClient } from './connectClient.js';
import { createSessionRegistry } from './createSessionRegistry.js';
import type { SessionRegistry } from './createSessionRegistry.js';
import { ATTACH_SITE_PACE, createSitePace } from './createSitePace.js';
import type { SitePaceClock, SitePaceRun } from './createSitePace.js';

/** A command the fake browser got. */
interface SentCommand {
    method: string;
    params?: object;
    sessionId?: string;
}

/** Messages a client must never get through to the browser, with or without a policy. */
const REFUSED: [string, Record<string, unknown>, string | undefined][] = [
    // Another client's session, a session of the proxy, an unknown one.
    ['Page.navigate', { url: 'https://example.com/' }, 's-b'],
    ['Page.navigate', { url: 'https://example.com/' }, 's-proxy'],
    ['Page.navigate', { url: 'https://example.com/' }, 'unknown'],
    // Another group's target, the proxy's own, an unknown one.
    ['Target.attachToTarget', { targetId: 't-b', flatten: true }, undefined],
    ['Target.attachToTarget', { targetId: 't-proxy', flatten: true }, undefined],
    ['Target.closeTarget', { targetId: 't-b' }, undefined],
    ['Target.activateTarget', { targetId: 't-b' }, undefined],
    ['Target.getTargetInfo', { targetId: 'unknown' }, undefined],
    // Detaching only an own session, by its id.
    ['Target.detachFromTarget', { sessionId: 's-b' }, undefined],
    ['Target.detachFromTarget', { sessionId: 's-proxy' }, undefined],
    ['Target.detachFromTarget', { targetId: 't-a' }, undefined],
    // Auto-attach at the browser would attach the client to every target.
    ['Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }, undefined],
    // The stealth rules.
    ['Runtime.addBinding', { name: 'binding' }, 's-a'],
    ['Runtime.compileScript', { expression: '1', sourceURL: '', persistScript: true }, 's-a'],
    ['Runtime.runScript', { scriptId: '1' }, 's-a'],
    ['Page.addScriptToEvaluateOnLoad', { scriptSource: 'x' }, 's-a'],
    ['Emulation.setUserAgentOverride', { userAgent: 'Bot/1.0' }, 's-a'],
    ['Network.setUserAgentOverride', { userAgent: 'Bot/1.0' }, 's-a'],
    ['Console.clearMessages', {}, 's-a'],
    ['Debugger.pause', {}, 's-a'],
    ['Target.sendMessageToTarget', { message: '{}', sessionId: 's-a' }, undefined],
    ['Target.exposeDevToolsProtocol', { targetId: 't-a' }, undefined],
    ['Target.attachToBrowserTarget', {}, undefined],
    ['Browser.close', {}, undefined],
    ['Runtime.evaluate', { expression: '1', contextId: 1 }, 's-a'],
];

test.each([
    ['no policy', undefined],
    ['a policy that passes everything', (request: CdpRequest) => request],
])('no refused command reaches the browser, with %s', async (_name, policy) => {
    const { browser, client } = prepare({ policy });

    for (const [method, params, sessionId] of REFUSED) {
        const reply = await client.call(method, params, sessionId);
        expect({ method, sessionId, error: isPlainObject(reply['error']) }).toEqual({
            method,
            sessionId,
            error: true,
        });
    }
    expect(browser.sent).toEqual([]);
});

test('a policy runs after the session and group rules, and what it passes is held to them and the stealth rules', async () => {
    const policy = mock<CdpPolicy<string>>((request, client) => {
        expect(client.data).toBe('data-a');
        switch (request.method) {
            case 'Page.reload':
                return { method: 'Runtime.addBinding', params: { name: 'binding' }, sessionId: request.sessionId };
            case 'Page.stopLoading':
                return { method: 'Page.navigate', params: { url: 'https://example.com/' }, sessionId: 's-b' };
            case 'Target.getTargetInfo':
                return { method: 'Target.closeTarget', params: { targetId: 't-b' } };
            default:
                return { reply: { answered: true } };
        }
    });
    const { browser, client } = prepare({ policy });

    // Named another group's target or session: refused before the policy is asked, even one that would answer it.
    expect((await client.call('Target.closeTarget', { targetId: 't-b' }))['error']).toBeDefined();
    expect((await client.call('Page.enable', {}, 's-b'))['error']).toBeDefined();
    expect(policy).not.toHaveBeenCalled();
    // Rewritten into what the client may not send.
    for (const [method, params, sessionId] of [
        ['Page.reload', {}, 's-a'],
        ['Page.stopLoading', {}, 's-a'],
        ['Target.getTargetInfo', { targetId: 't-a' }, undefined],
    ] as const) {
        expect((await client.call(method, params, sessionId))['error']).toBeDefined();
    }
    expect(browser.sent).toEqual([]);
    // Its own answer goes back as the reply.
    expect((await client.call('Page.enable', {}, 's-a'))['result']).toEqual({ answered: true });
    expect(policy).toHaveBeenCalledTimes(4);
});

test('a command a policy holds keeps the later commands of its session behind it, not those of others', async () => {
    const { promise: held, resolve: release } = Promise.withResolvers<void>();
    const { browser, client, registry } = prepare({
        policy: async request => {
            if (request.method === 'Page.navigate') {
                await held;
            }
            return request;
        },
    });
    registry.claimSession({ type: 'client', clientId: 'c-a' }, 's-a2', 't-a');

    const navigated = client.call('Page.navigate', { url: 'https://example.com/' }, 's-a');
    const reloaded = client.call('Page.reload', {}, 's-a');
    await client.call('Page.enable', {}, 's-a2');
    expect(browser.sent.map(sent => sent.method)).toEqual(['Page.enable']);

    release();
    await Promise.all([navigated, reloaded]);
    expect(browser.sent.map(sent => sent.method)).toEqual(['Page.enable', 'Page.navigate', 'Page.reload']);
});

test("a closed socket's commands never reach the browser", async () => {
    const { promise: held, resolve: release } = Promise.withResolvers<void>();
    const { browser, client } = prepare({
        policy: async request => {
            await held;
            return request;
        },
    });

    client.receive({ id: 1, method: 'Page.navigate', params: { url: 'https://example.com/' }, sessionId: 's-a' });
    client.receive({ id: 2, method: 'Page.reload', params: {}, sessionId: 's-a' });
    client.client.close();
    release();
    await Bun.sleep(10);

    expect(browser.sent).toEqual([]);
    expect(client.messages).toEqual([]);
});

test('sessions are flat, and an auto-attach is set on a session', async () => {
    const { browser, client } = prepare({});

    await client.call('Target.attachToTarget', { targetId: 't-a', flatten: false });
    await client.call('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true }, 's-a');

    expect(browser.sent).toEqual([
        { method: 'Target.attachToTarget', params: { targetId: 't-a', flatten: true } },
        {
            method: 'Target.setAutoAttach',
            params: { autoAttach: true, waitForDebuggerOnStart: true, flatten: true },
            sessionId: 's-a',
        },
    ]);
});

test('a page created with a URL is created blank and navigated by the proxy before the reply, and joins the group', async () => {
    const { browser, client, registry } = prepare({});

    const reply = await client.call('Target.createTarget', { url: 'https://example.com/', newWindow: true });

    expect(reply['result']).toEqual({ targetId: 't-new' });
    expect(browser.sent).toEqual([
        { method: 'Target.createTarget', params: { url: 'about:blank', newWindow: true } },
        { method: 'Target.attachToTarget', params: { targetId: 't-new', flatten: true } },
        { method: 'Page.navigate', params: { url: 'https://example.com/' }, sessionId: 's-new' },
        { method: 'Target.detachFromTarget', params: { sessionId: 's-new' } },
    ]);
    expect(registry.getTargetGroup('t-new')).toBe('group-a');
    expect(registry.getSessionOriginator('s-new')).toEqual({ type: 'proxy' });
});

test('without a pace, loads of one site go to the browser one right after another', async () => {
    const { browser, client } = prepare({});

    await client.call('Page.navigate', { url: 'https://example.com/' }, 's-a');
    await client.call('Page.navigate', { url: 'https://example.com/next' }, 's-a');
    await client.call('Target.createTarget', { url: 'https://example.com/other' });

    expect(browser.sent.filter(sent => sent.method === 'Page.navigate')).toHaveLength(3);
});

test("a page created with a URL takes its site's slot once, the proxy's navigation of it is not held, and what the pace refuses never reaches the browser", async () => {
    const clock = createManualClock();
    const registry = createSessionRegistry();
    const { browser, client } = prepare({ registry, pace: createSitePace({ clock })[ATTACH_SITE_PACE](registry) });

    await client.call('Target.createTarget', { url: 'https://example.com/' });
    expect(browser.sent.map(sent => sent.method)).toEqual([
        'Target.createTarget',
        'Target.attachToTarget',
        'Page.navigate',
        'Target.detachFromTarget',
    ]);

    const held = client.call('Page.navigate', { url: 'https://example.com/next' }, 's-a');
    await Bun.sleep(10);
    expect(browser.sent).toHaveLength(4);
    clock.advance(5000);
    await held;
    expect(browser.sent.at(-1)).toEqual({
        method: 'Page.navigate',
        params: { url: 'https://example.com/next' },
        sessionId: 's-a',
    });

    // Each in its own session's line, so all three are held at once.
    registry.claimSession({ type: 'client', clientId: 'c-a' }, 's-a2', 't-a');
    registry.claimSession({ type: 'client', clientId: 'c-a' }, 's-a3', 't-a');
    void client.call('Page.navigate', { url: 'https://example.com/' }, 's-a2');
    void client.call('Page.navigate', { url: 'https://example.com/' }, 's-a3');
    void client.call('Target.createTarget', { url: 'https://example.com/' });
    const refused = await client.call('Page.navigate', { url: 'https://example.com/' }, 's-a');
    expect(refused['error']).toMatchObject({
        message: 'example.com is paced at one page load every 5 s: the next action on it is possible in 20 s.',
    });
});

/** What `prepare` builds a client with. */
interface PrepareOptions {
    policy?: CdpPolicy<string>;
    pace?: Pick<SitePaceRun, 'gate'>;
    /** The registry to fill; a new one by default. */
    registry?: SessionRegistry;
}

/**
 * Client `c-a` of `group-a` owns page `t-a` and session `s-a`; `c-b` of `group-b` owns `t-b`/`s-b`; the proxy has its
 * own page `t-proxy` and a session `s-proxy` on `t-a`. The fake browser answers `createTarget` with `t-new` and
 * `attachToTarget` with `s-new`, anything else with `{}`.
 */
function prepare(options: PrepareOptions) {
    const registry = options.registry ?? createSessionRegistry();
    registry.claimTarget('group-a', 't-a');
    registry.claimSession({ type: 'client', clientId: 'c-a' }, 's-a', 't-a');
    registry.claimTarget('group-b', 't-b');
    registry.claimSession({ type: 'client', clientId: 'c-b' }, 's-b', 't-b');
    registry.claimProxyTarget('t-proxy');
    registry.claimSession({ type: 'proxy' }, 's-proxy', 't-a');

    const sent: SentCommand[] = [];
    const browser = {
        sent,
        send(method: string, params?: object, sessionId?: string) {
            sent.push(sessionId == null ? { method, params } : { method, params, sessionId });
            switch (method) {
                case 'Target.createTarget':
                    return Promise.resolve({ targetId: 't-new' });
                case 'Target.attachToTarget':
                    return Promise.resolve({ sessionId: 's-new' });
                default:
                    return Promise.resolve({});
            }
        },
    };
    const messages: Record<string, unknown>[] = [];
    const replies = new Map<number, (message: Record<string, unknown>) => void>();
    const client = connectClient({
        clientId: 'c-a',
        group: 'group-a',
        data: 'data-a',
        socket: {
            send(text) {
                const message: unknown = JSON.parse(text);
                if (!isPlainObject(message)) {
                    return;
                }
                messages.push(message);
                const id = message['id'];
                if (typeof id === 'number') {
                    replies.get(id)?.(message);
                }
            },
            close: () => {},
        },
        send: (method, params, sessionId) => browser.send(method, params, sessionId),
        registry,
        brand: { whenBranded: () => Promise.resolve() },
        onEvent: () => () => {},
        policy: options.policy,
        pace: options.pace,
        logger: createTestLogger('test').logger,
    });

    let lastId = 0;
    return {
        browser,
        registry,
        client: {
            client,
            messages,
            receive: (message: object) => client.receive(JSON.stringify(message)),
            /** Sends a command and resolves with the whole reply message. */
            call(method: string, params: object, sessionId?: string) {
                const id = ++lastId;
                return new Promise<Record<string, unknown>>(resolve => {
                    replies.set(id, resolve);
                    client.receive(JSON.stringify({ id, method, params, sessionId }));
                });
            },
        },
    };
}

/** A clock whose time moves only by `advance()`, which runs every timer due by then. */
function createManualClock() {
    let now = 0;
    const timers: { at: number; callback: () => void }[] = [];
    const clock: SitePaceClock & { advance(ms: number): void } = {
        now: () => now,
        setTimeout(callback, ms) {
            timers.push({ at: now + ms, callback });
        },
        advance(ms) {
            now += ms;
            for (const timer of timers.filter(pending => pending.at <= now)) {
                timers.splice(timers.indexOf(timer), 1);
                timer.callback();
            }
        },
    };
    return clock;
}
