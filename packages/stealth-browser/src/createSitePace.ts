import { createLogger } from '@nzyme/logging/createLogger.js';
import type { Logger } from '@nzyme/logging/Logger.js';
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

import type { CdpEvent, CdpRequest } from './CdpTypes.js';
import type { SessionRegistry } from './createSessionRegistry.js';
import { findChallengeVendor } from './findChallengeVendor.js';
import { readTargetInfo } from './readTargetInfo.js';
import { toSite } from './toSite.js';

/** The time and timers the pace runs on; a test passes one it moves itself. */
export interface SitePaceClock {
    /** Milliseconds since the epoch, like `Date.now()`. */
    now(): number;
    /** Calls `callback` once after `ms`; whatever it returns is ignored. */
    setTimeout(callback: () => void, ms: number): unknown;
}

/** The texts of the pace's refusals, which the client gets as the CDP error message. */
export interface SitePaceMessages {
    /**
     * A command refused because its site's next slot is too far off: `afterBlock` when the site is paused or runs at
     * the doubled interval after a block, else it is busy at one page load every `intervalMs`.
     */
    paused(site: string, waitMs: number, afterBlock: boolean, intervalMs: number): string;
    /** A command refused because the site blocked the browser a second time within `blockMemoryMs`. */
    stopped(site: string): string;
}

/** How the pace keeps every site; the defaults are a human's pace. */
export interface CreateSitePaceOptions {
    clock?: SitePaceClock;
    logger?: Logger;
    /** The least time between two page loads of a site; 5 s by default, doubled for `blockMemoryMs` after a block. */
    intervalMs?: number;
    /** How long a site is refused after its first block; 5 min by default. */
    pauseMs?: number;
    /**
     * How long a block is remembered, the doubled interval lasts and a stop after a second block lasts; 1 h by
     * default.
     */
    blockMemoryMs?: number;
    /** The longest wait a command is held for silently, longer ones are refused; 15 s by default. */
    maxHoldMs?: number;
    messages?: SitePaceMessages;
}

/**
 * A human pace on every site a browser visits, kept across browser runs: hand the same one to each
 * `launchStealthBrowser` that should share it. Opaque: create it with `createSitePace`.
 */
export interface SitePace {
    /** Attaches the pace to one browser run; the package's own. */
    readonly [ATTACH_SITE_PACE]: (registry: SitePaceRegistry) => SitePaceRun;
}

/** The pace attached to one browser run: it sees the run's events and gates its clients' commands. */
export interface SitePaceRun {
    /**
     * Resolves when a command that acts on a site may go: at once, or after holding it for its site's next slot (up to
     * `maxHoldMs`), which it then reserves. A longer wait, a pause after a block or a stop after a second one resolves
     * to a refusal. Commands that do not act on a site go at once.
     */
    gate(command: CdpRequest): Promise<SitePaceVerdict>;
    /** Feeds a browser event of the run, after the session registry saw it. */
    observe(event: CdpEvent): void;
    /** The browser exited: what the run knew of its pages is forgotten; what it learned of sites stays. */
    detach(): void;
}

/** Whether a command may go to the browser now; a refusal carries the message the client gets. */
export type SitePaceVerdict = { type: 'go' } | { type: 'refuse'; message: string };

/** What the pace reads of a run's sessions. */
export type SitePaceRegistry = Pick<SessionRegistry, 'getSessionOriginator' | 'getSessionTarget'>;

/** What the pace knows about one site. */
interface SiteState {
    /** The last page load on the site, or the slot reserved by the last loading command let through, whichever is later. */
    lastSlot?: number;
    /** Blocks within the last `blockMemoryMs`, oldest first. */
    blocks: number[];
    pausedUntil: number;
    doubledUntil: number;
    stoppedUntil: number;
}

/** What a run of the pace knows about one page (or other target) of its browser. */
interface PageState {
    /** The URL the page shows, from its target info. */
    url?: string;
    /** The request id of the page's current main document: deduplicates its load across sessions. */
    loadId?: string;
    /** The main document that already counted as a block, so one block page counts once. */
    blockedLoadId?: string;
}

/** The key a `SitePace` is attached by; not exported from the package, so only `launchStealthBrowser` attaches one. */
export const ATTACH_SITE_PACE = Symbol('attachSitePace');

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const INTERVAL_MS = 5 * SECOND_MS;
const PAUSE_MS = 5 * MINUTE_MS;
const BLOCK_MEMORY_MS = 60 * MINUTE_MS;
/** The longest wait held silently; agent-browser gives a command 30 s. */
const MAX_HOLD_MS = 15 * SECOND_MS;
/** Main-document statuses that are a block. */
const BLOCK_STATUSES = new Set([403, 429]);
/** The commands that surely load a page, so take the site's slot when let through. */
const LOADING_METHODS = new Set(['Page.navigate', 'Page.reload', 'Target.createTarget']);
/** The expressions agent-browser goes back and forward with; like a click, they wait but take no slot. */
const HISTORY_STEPS = new Set(['history.back()', 'history.forward()']);

const DEFAULT_MESSAGES: SitePaceMessages = {
    paused: (site, waitMs, afterBlock, intervalMs) => {
        const why = afterBlock
            ? 'after it blocked or challenged the browser'
            : `at one page load every ${formatWait(intervalMs)}`;
        return `${site} is paced ${why}: the next action on it is possible in ${formatWait(waitMs)}.`;
    },
    stopped: site =>
        `${site} blocked or challenged the browser twice in a short time, so acting on it is stopped for now.`,
};

/**
 * Creates a human pace for the sites a browser visits, shared by every client since a site sees one IP. Each site
 * gets at most one page load every `intervalMs`; a block (a 403 or 429 main document, or an anti-bot vendor's
 * challenge) pauses it for `pauseMs` and doubles its interval for `blockMemoryMs`, and a second block within that
 * stops it for `blockMemoryMs`. Page loads and blocks are recognised passively from the browser's events on pages a
 * client has a session on; the pace never sends a command of its own, so nothing of it is visible to a page.
 * @__NO_SIDE_EFFECTS__
 */
export function createSitePace(options: CreateSitePaceOptions = {}): SitePace {
    const clock = options.clock ?? { now: () => Date.now(), setTimeout: (callback, ms) => setTimeout(callback, ms) };
    const logger = options.logger ?? createLogger('SitePace');
    const intervalMs = options.intervalMs ?? INTERVAL_MS;
    const doubledIntervalMs = 2 * intervalMs;
    const pauseMs = options.pauseMs ?? PAUSE_MS;
    const blockMemoryMs = options.blockMemoryMs ?? BLOCK_MEMORY_MS;
    const maxHoldMs = options.maxHoldMs ?? MAX_HOLD_MS;
    const messages = options.messages ?? DEFAULT_MESSAGES;
    const sites = new Map<string, SiteState>();

    return { [ATTACH_SITE_PACE]: attach };

    function attach(registry: SitePaceRegistry): SitePaceRun {
        const pages = new Map<string, PageState>();

        return { gate, observe, detach: () => pages.clear() };

        async function gate(command: CdpRequest): Promise<SitePaceVerdict> {
            const url = findTargetUrl(command);
            const site = url == null ? null : toSite(url);
            if (site == null) {
                return { type: 'go' };
            }
            const state = getSite(site);
            const blocked = findBlockRefusal(command, site, state);
            if (blocked != null) {
                return blocked;
            }
            const now = clock.now();
            const doubled = now < state.doubledUntil;
            const interval = doubled ? doubledIntervalMs : intervalMs;
            const slot = Math.max(now, state.lastSlot == null ? now : state.lastSlot + interval);
            const wait = slot - now;
            if (wait > maxHoldMs) {
                logRefusal(command, site, 'busy', wait);
                return { type: 'refuse', message: messages.paused(site, wait, doubled, interval) };
            }

            // Only a command that surely loads a page takes the slot; a click or Enter waits for it, and a load it
            // causes is counted when its document arrives.
            if (LOADING_METHODS.has(command.method)) {
                state.lastSlot = slot;
            }
            if (wait > 0) {
                logger.debug('A command waits for its site', { site, method: command.method, waitMs: wait });
                await new Promise<void>(resolve => {
                    clock.setTimeout(resolve, wait);
                });
            }
            // A block recognised while it waited, from the previous command or another client, stops it too.
            return findBlockRefusal(command, site, state) ?? { type: 'go' };
        }

        /** The refusal for a site that is paused or stopped after a block, now; `null` when it is neither. */
        function findBlockRefusal(command: CdpRequest, site: string, state: SiteState): SitePaceVerdict | null {
            const now = clock.now();
            forgetOldBlocks(state, now);
            if (now < state.stoppedUntil) {
                logRefusal(command, site, 'stopped', state.stoppedUntil - now);
                return { type: 'refuse', message: messages.stopped(site) };
            }
            if (now < state.pausedUntil) {
                const wait = state.pausedUntil - now;
                logRefusal(command, site, 'paused', wait);
                const interval = now < state.doubledUntil ? doubledIntervalMs : intervalMs;
                return { type: 'refuse', message: messages.paused(site, wait, true, interval) };
            }
            return null;
        }

        /** The URL a command acts on: its target URL for a navigation, else the page of its session, if it acts at all. */
        function findTargetUrl({ method, params, sessionId }: CdpRequest) {
            switch (method) {
                case 'Runtime.evaluate':
                    // agent-browser v0.43.0 goes back and forward with exactly these (`handle_back`, `handle_forward`
                    // in `cli/src/native/actions.rs`). Navigations in a client's own scripts are counted when their
                    // document arrives, not held.
                    return HISTORY_STEPS.has(String(params['expression'])) ? findSessionUrl(sessionId) : undefined;
                case 'Page.navigate':
                case 'Target.createTarget':
                    return typeof params['url'] === 'string' ? params['url'] : undefined;
                case 'Page.reload':
                    return findSessionUrl(sessionId);
                case 'Input.dispatchMouseEvent': {
                    // A double click's second press belongs to the same action as its first.
                    const clickCount = params['clickCount'];
                    const isFirstPress = typeof clickCount !== 'number' || clickCount <= 1;
                    return params['type'] === 'mousePressed' && isFirstPress ? findSessionUrl(sessionId) : undefined;
                }
                case 'Input.dispatchKeyEvent': {
                    const isKeyDown = params['type'] === 'keyDown' || params['type'] === 'rawKeyDown';
                    return isKeyDown && params['key'] === 'Enter' ? findSessionUrl(sessionId) : undefined;
                }
                default:
                    return undefined;
            }
        }

        function findSessionUrl(sessionId: string | undefined) {
            const targetId = sessionId == null ? undefined : registry.getSessionTarget(sessionId);
            return targetId == null ? undefined : pages.get(targetId)?.url;
        }

        function observe(event: CdpEvent) {
            const params = isPlainObject(event.params) ? event.params : {};
            switch (event.method) {
                case 'Target.targetCreated':
                case 'Target.targetInfoChanged': {
                    const info = readTargetInfo(params);
                    if (info) {
                        getPage(info.targetId).url = info.url;
                    }
                    return;
                }
                case 'Target.targetDestroyed':
                    if (typeof params['targetId'] === 'string') {
                        pages.delete(params['targetId']);
                    }
                    return;
                case 'Network.responseReceived':
                    onResponse(event.sessionId, params);
                    return;
                case 'Network.requestWillBeSent':
                    onRequest(event.sessionId, params);
                    break;
            }
        }

        /** A main-document response on a client's page is a page load, and a block when it is 403 or 429. */
        function onResponse(sessionId: string | undefined, params: Record<string, unknown>) {
            const targetId = findClientPage(sessionId);
            const { requestId, response } = params;
            if (
                targetId == null ||
                params['type'] !== 'Document' ||
                // A page target's main frame has the target's id.
                params['frameId'] !== targetId ||
                typeof requestId !== 'string' ||
                !isPlainObject(response) ||
                typeof response['url'] !== 'string'
            ) {
                return;
            }
            const page = getPage(targetId);
            if (page.loadId === requestId) {
                return;
            }
            page.loadId = requestId;
            const site = toSite(response['url']);
            if (site == null) {
                return;
            }
            const state = getSite(site);
            const now = clock.now();
            state.lastSlot = Math.max(state.lastSlot ?? now, now);
            const status = response['status'];
            if (typeof status === 'number' && BLOCK_STATUSES.has(status)) {
                page.blockedLoadId = requestId;
                recordBlock(site, `status ${status}`);
            }
        }

        /** A request to a vendor's challenge on a client's page makes its current document a block page. */
        function onRequest(sessionId: string | undefined, params: Record<string, unknown>) {
            const targetId = findClientPage(sessionId);
            const request = params['request'];
            if (targetId == null || !isPlainObject(request) || typeof request['url'] !== 'string') {
                return;
            }
            const vendor = findChallengeVendor(request['url']);
            const page = getPage(targetId);
            const site = page.url == null ? null : toSite(page.url);
            if (vendor == null || site == null || page.blockedLoadId === (page.loadId ?? '')) {
                return;
            }
            page.blockedLoadId = page.loadId ?? '';
            recordBlock(site, `${vendor} challenge`);
        }

        /** The page a client's session is attached to; `undefined` for a session of the proxy or an unknown one. */
        function findClientPage(sessionId: string | undefined) {
            if (sessionId == null || registry.getSessionOriginator(sessionId)?.type !== 'client') {
                return undefined;
            }
            return registry.getSessionTarget(sessionId);
        }

        function getPage(targetId: string) {
            let page = pages.get(targetId);
            if (!page) {
                page = {};
                pages.set(targetId, page);
            }
            return page;
        }
    }

    function recordBlock(site: string, reason: string) {
        const state = getSite(site);
        const now = clock.now();
        forgetOldBlocks(state, now);
        state.blocks.push(now);
        if (state.blocks.length >= 2) {
            state.stoppedUntil = now + blockMemoryMs;
        } else {
            state.pausedUntil = now + pauseMs;
            state.doubledUntil = now + blockMemoryMs;
        }
        logger.info('A site showed a block', { site, reason, recentBlocks: state.blocks.length });
    }

    function logRefusal(command: CdpRequest, site: string, reason: string, waitMs: number) {
        logger.info('A command was refused to keep the pace', { site, method: command.method, reason, waitMs });
    }

    function forgetOldBlocks(state: SiteState, now: number) {
        state.blocks = state.blocks.filter(at => now - at < blockMemoryMs);
    }

    function getSite(site: string) {
        let state = sites.get(site);
        if (!state) {
            state = { blocks: [], pausedUntil: 0, doubledUntil: 0, stoppedUntil: 0 };
            sites.set(site, state);
        }
        return state;
    }
}

/** A wait in words: seconds under a minute, else whole minutes, rounded up. */
function formatWait(ms: number) {
    return ms < MINUTE_MS ? `${Math.ceil(ms / SECOND_MS)} s` : `${Math.ceil(ms / MINUTE_MS)} min`;
}
