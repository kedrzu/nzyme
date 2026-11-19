import type { Logger } from '@nzyme/logging/Logger.js';
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

import { attachTargetSession } from './attachTargetSession.js';
import { buildChromeBrand } from './buildChromeBrand.js';
import type { BrandVersion, UserAgentOverride, UserAgentMetadata } from './buildChromeBrand.js';
import type { CdpEvent } from './CdpTypes.js';
import type { SessionRegistry } from './createSessionRegistry.js';
import { isStringArray } from './isStringArray.js';
import { readTargetInfo } from './readTargetInfo.js';

/** The `Google Chrome` brand of one browser run. */
export interface BrandOverride {
    /**
     * Reads the browser's own identity and from then on holds every new target until it carries the brand. Call it once,
     * before anything else creates a target; rejects when the browser's identity cannot be read.
     */
    start(): Promise<void>;
    /** Brands the targets the proxy's auto-attach holds; call it with every event, after the registry observed it. */
    observe(event: CdpEvent): void;
    /**
     * Settles once the browser has answered the brand of a target: navigate a new page only then. Sent before it, the
     * first navigation can commit, under load, with the browser's own name (a page then read Chromium in about 1 of 20
     * runs). Settles at once for a target the brand never held.
     */
    whenBranded(targetId: string): Promise<void>;
}

/** What the brand needs of its browser run. */
export interface CreateBrandOverrideParams {
    /** Sends a CDP command on the run's pipe, before the run is ready too. */
    send: (method: string, params?: object, sessionId?: string) => Promise<unknown>;
    registry: SessionRegistry;
    logger: Logger;
}

/** The targets a page's script can read the brand in: documents, out-of-process frames and every kind of worker. */
const BRANDED_TYPES = new Set(['page', 'iframe', 'worker', 'shared_worker', 'service_worker']);
/** The auto-attach the proxy holds every new target with, at the browser and on each of its own sessions. */
const HOLD_NEW_TARGETS = { autoAttach: true, waitForDebuggerOnStart: true, flatten: true };
/**
 * A page of the browser's own, a secure context with no web content: `about:blank` has no `navigator.userAgentData`,
 * and a web page would mean the network.
 */
const IDENTITY_PAGE_URL = 'chrome://version/';
/** Reads the identity in the identity page; `uaFullVersion` is what CDP calls `fullVersion`. */
const READ_IDENTITY = `navigator.userAgentData
    .getHighEntropyValues(['architecture', 'bitness', 'formFactors', 'fullVersionList', 'model', 'platformVersion', 'uaFullVersion', 'wow64'])
    .then(({ uaFullVersion, ...values }) => ({ ...values, fullVersion: uaFullVersion, userAgent: navigator.userAgent }))`;

/**
 * Creates the brand of one browser run. Chrome for Testing names itself only Chromium, and detectors compare a page
 * with its workers, so the brand reaches every target a page's script runs in, before its first script: the proxy
 * auto-attaches at the browser and on each of its own sessions with `waitForDebuggerOnStart`, and on each new target
 * sends the override, the same auto-attach and the resume at once, in that order on the pipe. A target held by several
 * auto-attached sessions starts only once each resumed it (checked on Chrome for Testing 157 for frames, workers and
 * service workers), so a client resuming its own session early starts nothing ahead of the brand. The override lives
 * as long as the proxy's session: an override is per session and goes when its session detaches, and the most recent
 * one of the sessions still attached wins, which is why clients must not set one of their own. Nothing runs in a page
 * for it: no domain is enabled, no script is added.
 * @__NO_SIDE_EFFECTS__
 */
export function createBrandOverride(params: CreateBrandOverrideParams): BrandOverride {
    const { send, registry, logger } = params;
    let override: UserAgentOverride | null = null;
    /** The answer to each held target's brand, until the target is destroyed. */
    const brandings = new Map<string, Promise<void>>();

    return { start, observe, whenBranded: targetId => brandings.get(targetId) ?? Promise.resolve() };

    async function start() {
        override = buildChromeBrand(...(await readIdentity()));
        await send('Target.setAutoAttach', HOLD_NEW_TARGETS);
    }

    function observe(event: CdpEvent) {
        if (event.method === 'Target.targetDestroyed') {
            const targetId = isPlainObject(event.params) ? event.params['targetId'] : undefined;
            if (typeof targetId === 'string') {
                brandings.delete(targetId);
            }
            return;
        }
        if (event.method !== 'Target.attachedToTarget') {
            return;
        }
        const info = readTargetInfo(event.params);
        const sessionId = isPlainObject(event.params) ? event.params['sessionId'] : undefined;
        if (!info || typeof sessionId !== 'string' || !isOwnAutoAttach(sessionId, info.targetId, event.sessionId)) {
            return;
        }

        if (override != null && BRANDED_TYPES.has(info.type)) {
            brandings.set(info.targetId, sendOnSession('Emulation.setUserAgentOverride', override, sessionId));
            void sendOnSession('Target.setAutoAttach', HOLD_NEW_TARGETS, sessionId);
            void sendOnSession('Runtime.runIfWaitingForDebugger', {}, sessionId);
        } else {
            // Browser UI and the like: nothing a page reads, so it is let go.
            void sendOnSession('Runtime.runIfWaitingForDebugger', {}, sessionId);
            void sendOnSession('Target.detachFromTarget', { sessionId });
        }
    }

    /**
     * Whether the session comes from the proxy's auto-attach: at the browser, a top-level attach the registry left
     * unclaimed (nobody announced it with `expectAttach`, or it is held waiting for the debugger, which an explicit
     * attach never is: it comes as the target is created, before anyone could ask for it), claimed here for the proxy;
     * under a session, one whose parent is the proxy's, which the registry has already given to the proxy.
     */
    function isOwnAutoAttach(sessionId: string, targetId: string, parentSessionId: string | undefined) {
        const originator = registry.getSessionOriginator(sessionId);
        if (parentSessionId != null) {
            return originator?.type === 'proxy';
        }
        if (originator != null) {
            return false;
        }
        registry.claimSession({ type: 'proxy' }, sessionId, targetId);
        return true;
    }

    async function sendOnSession(method: string, methodParams: object, sessionId?: string) {
        try {
            await send(method, methodParams, sessionId);
        } catch (error) {
            // A short-lived frame or worker can go before its commands arrive.
            logger.debug('A brand command failed', { method, error });
        }
    }

    /** The browser's own user agent and metadata, read in a page of its own that is closed again. */
    async function readIdentity(): Promise<[string, UserAgentMetadata]> {
        const created = await send('Target.createTarget', {
            url: 'about:blank',
            background: true,
            newWindow: true,
            windowState: 'minimized',
        });
        const targetId = isPlainObject(created) ? created['targetId'] : undefined;
        if (typeof targetId !== 'string') {
            throw new TypeError('Target.createTarget gave no target id');
        }
        registry.claimProxyTarget(targetId);
        try {
            const sessionId = await attachTargetSession({ send, registry, originator: { type: 'proxy' }, targetId });
            await send('Page.navigate', { url: IDENTITY_PAGE_URL }, sessionId);
            const reply = await send(
                'Runtime.evaluate',
                { expression: READ_IDENTITY, awaitPromise: true, returnByValue: true },
                sessionId,
            );
            const value = isPlainObject(reply) && isPlainObject(reply['result']) ? reply['result']['value'] : undefined;
            const identity = readIdentityValue(value);
            if (!identity) {
                throw new TypeError("The browser's identity could not be read");
            }
            return identity;
        } finally {
            await send('Target.closeTarget', { targetId }).catch((error: unknown) =>
                logger.warn('The identity page could not be closed', { error }),
            );
        }
    }
}

function readIdentityValue(value: unknown): [string, UserAgentMetadata] | null {
    if (!isPlainObject(value)) {
        return null;
    }
    const { userAgent, brands, fullVersionList, fullVersion, platform, platformVersion, architecture, model } = value;
    const { mobile, bitness, wow64, formFactors } = value;
    if (
        typeof userAgent !== 'string' ||
        !isBrandList(brands) ||
        !isBrandList(fullVersionList) ||
        typeof fullVersion !== 'string' ||
        typeof platform !== 'string' ||
        typeof platformVersion !== 'string' ||
        typeof architecture !== 'string' ||
        typeof model !== 'string' ||
        typeof mobile !== 'boolean' ||
        typeof bitness !== 'string' ||
        typeof wow64 !== 'boolean' ||
        !isStringArray(formFactors)
    ) {
        return null;
    }
    return [
        userAgent,
        {
            brands,
            fullVersionList,
            fullVersion,
            platform,
            platformVersion,
            architecture,
            model,
            mobile,
            bitness,
            wow64,
            formFactors,
        },
    ];
}

function isBrandList(value: unknown): value is BrandVersion[] {
    return (
        Array.isArray(value) &&
        value.every(
            (item: unknown) =>
                isPlainObject(item) && typeof item['brand'] === 'string' && typeof item['version'] === 'string',
        )
    );
}
