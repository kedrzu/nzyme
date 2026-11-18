import type { Logger } from '@nzyme/logging/Logger.js';
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

import { attachTargetSession } from './attachTargetSession.js';
import { CdpError } from './CdpTypes.js';
import type { CdpEvent, CdpPolicy, CdpPolicyClient, CdpRequest, CdpSocket } from './CdpTypes.js';
import { checkStealthRequest } from './checkStealthRequest.js';
import type { BrandOverride } from './createBrandOverride.js';
import type { StealthDecision } from './checkStealthRequest.js';
import { createIsolatedWorlds } from './createIsolatedWorlds.js';
import type { SessionOriginator, SessionRegistry } from './createSessionRegistry.js';
import type { SitePaceRun } from './createSitePace.js';
import { readTargetInfo } from './readTargetInfo.js';

/** A connected client: its socket's handlers call into it. */
export interface CdpClient {
    /** Handles one text message from the socket: a CDP command. */
    receive(text: string): void;
    /** The socket closed: detaches every session this client opened; its pages stay. */
    close(): void;
}

/** One client connection and what it may reach. */
export interface ConnectClientParams<D> {
    /** Unique per connection: the originator of the CDP sessions this client opens. */
    clientId: string;
    /** The group whose pages the client sees and the pages it creates join; none: every page but the proxy's own. */
    group?: string;
    /** The caller's data on the client, handed to the policy. */
    data: D;
    socket: CdpSocket;
    /** Sends a CDP command on the browser's pipe. */
    send: (method: string, params?: object, sessionId?: string) => Promise<unknown>;
    registry: SessionRegistry;
    /** The brand of the browser run, which a page created with a URL waits for before it is navigated. */
    brand: Pick<BrandOverride, 'whenBranded'>;
    /** Subscribes to every browser event, after the registry saw it; returns the unsubscribe. */
    onEvent: (listener: (event: CdpEvent) => void) => () => void;
    policy?: CdpPolicy<D>;
    /** The site pace of the browser run: holds or refuses what acts on a site. None: nothing waits. */
    pace?: Pick<SitePaceRun, 'gate'>;
    logger: Logger;
}

/** A refusal of the proxy's own checks, in the policy's shape. */
interface Refusal {
    reject: string;
}

/** A CDP error code the browser uses for a generic server error; the proxy's own refusals carry it too. */
const SERVER_ERROR = -32_000;
/** A CDP error code for a message that is not JSON. */
const PARSE_ERROR = -32_700;

/** The target lifecycle events a client gets for the targets it sees once it discovers targets. */
const TARGET_EVENTS = new Set([
    'Target.targetCreated',
    'Target.targetInfoChanged',
    'Target.targetDestroyed',
    'Target.targetCrashed',
]);

/**
 * Connects one client to the shared browser and judges each of its messages, in this order: the message shape; the
 * proxy's own rules (a session must be the client's, a target its group's, sessions flat); the caller's `policy`; the
 * same rules again on what the policy passed, so a rewrite cannot reach further than the client could; then the
 * stealth rules (`checkStealthRequest`), which no policy can lift; then the site `pace`, when there is one. Each
 * message takes its session's place in line when it arrives, and an async policy or a held command waits inside that
 * place, so a later command of the session never overtakes it on the wire; a command of a closed socket is never
 * sent. Only what belongs to the client is passed back: events of a session go to the client that opened it, target
 * events only for the targets it sees and only once it discovers targets; replies carry the client's own ids. A page a
 * grouped client creates joins its group, and is announced to it, since the browser's own `Target.targetCreated` comes before the claim and is filtered out.
 */
export function connectClient<D>(params: ConnectClientParams<D>): CdpClient {
    const { clientId, group, data, socket, send, registry, brand, policy, pace, logger } = params;
    const originator: SessionOriginator = { type: 'client', clientId };
    const worlds = createIsolatedWorlds(send);
    const policyClient: CdpPolicyClient<D> = {
        id: clientId,
        group,
        data,
        sessionTarget: sessionId => (isOwnSession(sessionId) ? registry.getSessionTarget(sessionId) : undefined),
    };

    /** Top-level sessions this client opened, detached when it goes. */
    const sessions = new Set<string>();
    /** Targets the client was told about, so their `Target.targetDestroyed` (after the registry forgot them) reaches it. */
    const shownTargets = new Set<string>();
    /** `Target.targetCreated` of unseen targets while a `Target.createTarget` of this client is in flight, by target. */
    const createdWhileCreating = new Map<string, unknown>();
    /**
     * Per session (`undefined`: the browser itself), the moment the last command still waiting there is sent: a command
     * whose policy has not answered yet keeps every later command of its session behind it.
     */
    const waiting = new Map<string | undefined, Promise<void>>();
    let creating = 0;
    let discovering = false;
    let closed = false;

    const unsubscribe = params.onEvent(onEvent);

    return { receive, close };

    function receive(text: string) {
        let message: unknown;
        try {
            message = JSON.parse(text);
        } catch {
            sendError(undefined, PARSE_ERROR, 'Message must be valid JSON');
            return;
        }
        if (!isPlainObject(message) || typeof message['id'] !== 'number') {
            sendError(undefined, SERVER_ERROR, 'A CDP message needs a numeric id');
            return;
        }
        const sessionId = message['sessionId'];
        void handleMessage(message['id'], message, typeof sessionId === 'string' ? sessionId : undefined);
    }

    function close() {
        if (closed) {
            return;
        }
        closed = true;
        unsubscribe();
        for (const sessionId of sessions) {
            send('Target.detachFromTarget', { sessionId }).catch((error: unknown) => {
                logger.debug('A client session could not be detached', { error });
            });
        }
        sessions.clear();
    }

    /** Takes the session's place in line synchronously, then judges and executes the message there. */
    async function handleMessage(id: number, message: Record<string, unknown>, key: string | undefined) {
        const before = waiting.get(key);
        const { promise: sent, resolve: markSent } = Promise.withResolvers<void>();
        waiting.set(key, sent);
        try {
            await before;
            // The socket closed while an earlier command waited: nothing more is sent.
            if (closed) {
                return;
            }
            const decided = await decide(message);
            // The socket closed while the policy judged: its sessions are detached, and nothing is sent for it any more.
            if (closed) {
                return;
            }
            const decision = await keepPace(decided);
            // The socket closed while the command was held, and no site's slot is used.
            if (closed) {
                return;
            }
            // Runs up to the browser call before the next command of the session is let go.
            const executed = execute(id, decision);
            markSent();
            await executed;
        } finally {
            markSent();
            if (waiting.get(key) === sent) {
                waiting.delete(key);
            }
        }
    }

    async function decide(message: Record<string, unknown>): Promise<StealthDecision> {
        const request = readRequest(message);
        if ('reject' in request) {
            return { type: 'reject', message: request.reject };
        }
        const checked = checkClientRules(request);
        if ('reject' in checked) {
            return { type: 'reject', message: checked.reject };
        }
        if (policy == null) {
            return checkStealthRequest(checked, worlds);
        }

        let judged;
        try {
            judged = await policy(checked, policyClient);
        } catch (error) {
            logger.warn('The policy failed', { error, method: checked.method });
            return { type: 'reject', message: `${checked.method}: the command could not be judged` };
        }
        if ('reply' in judged) {
            return { type: 'reply', result: judged.reply };
        }
        if ('reject' in judged) {
            return { type: 'reject', message: judged.reject };
        }
        // A rewritten request is held to the client's rules again: a policy cannot name what the client could not.
        const rechecked = checkClientRules(judged);
        if ('reject' in rechecked) {
            return { type: 'reject', message: rechecked.reject };
        }
        return checkStealthRequest(rechecked, worlds);
    }

    /**
     * Holds a decision that acts on a site until the pace lets it go, or turns it into the pace's refusal. The proxy's
     * own navigation of a page created with a URL (`createTarget`) is not paced again: the client's
     * `Target.createTarget` with its URL is the paced load.
     */
    async function keepPace(decision: StealthDecision): Promise<StealthDecision> {
        const command = findPacedCommand(decision);
        if (pace == null || command == null) {
            return decision;
        }
        const verdict = await pace.gate(command);
        return verdict.type === 'refuse' ? { type: 'reject', message: verdict.message } : decision;
    }

    /**
     * The proxy's own rules, which come before the policy: a session must be one this client opened; a target a
     * `Target.*` method names must be one the client sees (`isVisibleTarget`), a session it names one of its own;
     * sessions are flat, so every command of a session comes through here; auto-attach is set per session only, as at
     * the browser it would attach the client to every target.
     */
    function checkClientRules(request: CdpRequest): CdpRequest | Refusal {
        const { method, params: requestParams, sessionId } = request;
        if (sessionId != null && !isOwnSession(sessionId)) {
            return { reject: `${method}: unknown session ${sessionId}` };
        }
        if (!method.startsWith('Target.')) {
            return request;
        }
        const { targetId, sessionId: namedSession } = requestParams;
        if (targetId != null && !isVisibleTarget(targetId)) {
            return { reject: `${method}: unknown target` };
        }
        if (namedSession != null && !isOwnSession(namedSession)) {
            return { reject: `${method}: unknown session` };
        }

        switch (method) {
            case 'Target.attachToTarget':
                return { ...request, params: { ...requestParams, flatten: true } };
            case 'Target.setAutoAttach':
                return sessionId == null
                    ? { reject: `${method} must be sent on a session of a page` }
                    : { ...request, params: { ...requestParams, flatten: true } };
            case 'Target.detachFromTarget':
                // By target alone, the browser would pick a session of the target: perhaps someone else's.
                return namedSession == null ? { reject: `${method}: name a session of your own` } : request;
            default:
                return request;
        }
    }

    /**
     * Runs a decision. A let-through command makes its session's target the group's last used before it is sent, so a
     * popup the command opens, claimed when it appears, comes after it.
     */
    async function execute(id: number, decision: StealthDecision) {
        try {
            switch (decision.type) {
                case 'reply':
                    sendReply(id, decision.result);
                    return;
                case 'reject':
                    sendError(id, SERVER_ERROR, decision.message);
                    return;
                case 'isolate':
                    touchSession(decision.call.sessionId);
                    sendReply(id, await worlds.send(decision.call));
                    return;
                case 'createWorld':
                    touchSession(decision.sessionId);
                    sendReply(id, await worlds.createClientWorld(decision.sessionId, decision.world));
                    return;
                case 'forward':
                    touchSession(decision.sessionId);
                    sendReply(id, await forward(decision.method, decision.params, decision.sessionId));
                    break;
            }
        } catch (error) {
            if (error instanceof CdpError) {
                sendError(id, error.code, error.message, error.data);
            } else {
                sendError(id, SERVER_ERROR, error instanceof Error ? error.message : 'The command failed');
            }
        }
    }

    async function forward(method: string, forwardParams: Record<string, unknown>, sessionId: string | undefined) {
        switch (method) {
            case 'Target.setDiscoverTargets':
                // The browser already discovers for the proxy; answered here, replaying what Chrome would replay.
                return setDiscoverTargets(forwardParams['discover'] === true);
            case 'Target.getTargets':
                return filterTargets(await send(method, forwardParams));
            case 'Target.createTarget':
                return createTarget(forwardParams);
            case 'Target.attachToTarget':
                return attachToTarget(forwardParams);
            default:
                return send(method, forwardParams, sessionId);
        }
    }

    async function setDiscoverTargets(discover: boolean) {
        if (discover && !discovering) {
            const reply = await send('Target.getTargets', {});
            const infos = isPlainObject(reply) ? reply['targetInfos'] : undefined;
            const list: readonly unknown[] = Array.isArray(infos) ? infos : [];
            for (const targetInfo of list) {
                const targetId = readTargetInfo({ targetInfo })?.targetId;
                if (targetId != null && isVisibleTarget(targetId)) {
                    announceTarget(targetId, targetInfo);
                }
            }
        }
        discovering = discover;
        return {};
    }

    function filterTargets(reply: unknown) {
        const infos = isPlainObject(reply) ? reply['targetInfos'] : undefined;
        const list: readonly unknown[] = Array.isArray(infos) ? infos : [];
        const targetInfos: unknown[] = [];
        for (const targetInfo of list) {
            const targetId = readTargetInfo({ targetInfo })?.targetId;
            if (targetId != null && isVisibleTarget(targetId)) {
                shownTargets.add(targetId);
                targetInfos.push(targetInfo);
            }
        }
        return { targetInfos };
    }

    /**
     * Creates a page. One with a URL is created blank and then navigated by the proxy, before the reply: with the URL
     * in `Target.createTarget`, the first navigation can commit before the brand reaches the page, whose first script
     * then read the browser's own name in 2 runs of 6.
     */
    async function createTarget(createParams: Record<string, unknown>) {
        const { url } = createParams;
        const opensUrl = typeof url === 'string' && url !== '' && url !== 'about:blank';
        creating++;
        let reply: unknown;
        try {
            reply = await send(
                'Target.createTarget',
                opensUrl ? { ...createParams, url: 'about:blank' } : createParams,
            );
        } finally {
            creating--;
        }
        const targetId = isPlainObject(reply) ? reply['targetId'] : undefined;
        if (typeof targetId === 'string' && group != null) {
            registry.claimTarget(group, targetId);
            const created = createdWhileCreating.get(targetId);
            if (discovering && isPlainObject(created)) {
                announceTarget(targetId, created['targetInfo']);
            }
        }
        if (creating === 0) {
            createdWhileCreating.clear();
        }
        if (typeof targetId === 'string' && opensUrl) {
            await navigateNewTarget(targetId, url);
        }
        return reply;
    }

    /**
     * Navigates a page the client created on a session of the proxy's own, detached again after, once the browser has
     * answered its brand (`BrandOverride.whenBranded`).
     */
    async function navigateNewTarget(targetId: string, url: string) {
        let sessionId: string | undefined;
        try {
            await brand.whenBranded(targetId);
            sessionId = await attachTargetSession({ send, registry, originator: { type: 'proxy' }, targetId });
            registry.claimSession({ type: 'proxy' }, sessionId, targetId);
            await send('Page.navigate', { url }, sessionId);
        } catch (error) {
            // The page exists all the same; the client gets it and sees where it is.
            logger.warn('A new page could not be navigated', { error });
        } finally {
            if (sessionId != null) {
                send('Target.detachFromTarget', { sessionId }).catch((error: unknown) => {
                    logger.debug('A navigation session could not be detached', { error });
                });
            }
        }
    }

    async function attachToTarget(attachParams: Record<string, unknown>) {
        const targetId = attachParams['targetId'];
        if (typeof targetId !== 'string') {
            throw new TypeError('Target.attachToTarget needs a targetId');
        }
        const release = registry.expectAttach(originator, targetId);
        let reply: unknown;
        try {
            reply = await send('Target.attachToTarget', attachParams);
        } finally {
            release();
        }
        const sessionId = isPlainObject(reply) ? reply['sessionId'] : undefined;
        if (typeof sessionId === 'string') {
            registry.claimSession(originator, sessionId, targetId);
            sessions.add(sessionId);
        }
        return reply;
    }

    function onEvent(event: CdpEvent) {
        if (closed) {
            return;
        }
        const eventParams = isPlainObject(event.params) ? event.params : {};
        // What the worlds hold for a detached session goes; a nested session's detach comes on its parent session.
        if (event.method === 'Target.detachedFromTarget' && typeof eventParams['sessionId'] === 'string') {
            worlds.forget(eventParams['sessionId']);
        }
        if (event.sessionId != null) {
            if (isOwnSession(event.sessionId)) {
                sendEvent(event);
            }
            return;
        }

        switch (event.method) {
            case 'Target.attachedToTarget':
                if (typeof eventParams['sessionId'] === 'string' && isOwnSession(eventParams['sessionId'])) {
                    sessions.add(eventParams['sessionId']);
                    sendEvent(event);
                }
                return;
            case 'Target.detachedFromTarget':
                // The registry forgot the session before this event; the client's own record still has it.
                if (typeof eventParams['sessionId'] === 'string' && sessions.delete(eventParams['sessionId'])) {
                    sendEvent(event);
                }
                return;
        }
        if (TARGET_EVENTS.has(event.method)) {
            onTargetEvent(event, eventParams);
        }
    }

    function onTargetEvent(event: CdpEvent, eventParams: Record<string, unknown>) {
        const targetId = readTargetInfo(eventParams)?.targetId ?? eventParams['targetId'];
        if (typeof targetId !== 'string') {
            return;
        }
        // A destroyed target is already forgotten by the registry: only one the client was shown is announced gone.
        const isShown =
            event.method === 'Target.targetDestroyed'
                ? shownTargets.has(targetId)
                : isVisibleTarget(targetId) || shownTargets.has(targetId);
        if (event.method === 'Target.targetCreated' && !isShown && creating > 0) {
            createdWhileCreating.set(targetId, eventParams);
        }
        if (!discovering || !isShown) {
            return;
        }
        if (event.method === 'Target.targetDestroyed') {
            shownTargets.delete(targetId);
        } else {
            shownTargets.add(targetId);
        }
        sendEvent(event);
    }

    function announceTarget(targetId: string, targetInfo: unknown) {
        shownTargets.add(targetId);
        sendEvent({ method: 'Target.targetCreated', params: { targetInfo } });
    }

    /** Parses a message's shape: a method string, a params object (or none), a sessionId string (or none). */
    function readRequest(message: Record<string, unknown>): CdpRequest | Refusal {
        const { method, params: requestParams = {}, sessionId } = message;
        if (typeof method !== 'string') {
            return { reject: 'A CDP message needs a method' };
        }
        if (!isPlainObject(requestParams)) {
            return { reject: `${method}: params must be an object` };
        }
        if (sessionId != null && typeof sessionId !== 'string') {
            return { reject: `${method}: sessionId must be a string` };
        }
        return sessionId == null ? { method, params: requestParams } : { method, params: requestParams, sessionId };
    }

    function isOwnSession(sessionId: unknown) {
        if (typeof sessionId !== 'string') {
            return false;
        }
        const owner = registry.getSessionOriginator(sessionId);
        return owner?.type === 'client' && owner.clientId === clientId;
    }

    /** A grouped client sees its group's targets; one with no group every target but the proxy's own. */
    function isVisibleTarget(targetId: unknown) {
        if (typeof targetId !== 'string') {
            return false;
        }
        return group == null ? !registry.isProxyTarget(targetId) : registry.getTargetGroup(targetId) === group;
    }

    function touchSession(sessionId: string | undefined) {
        const targetId =
            sessionId != null && isOwnSession(sessionId) ? registry.getSessionTarget(sessionId) : undefined;
        if (targetId != null && group != null) {
            registry.touch(group, targetId);
        }
    }

    function sendEvent(event: CdpEvent) {
        write({ method: event.method, params: event.params, sessionId: event.sessionId });
    }

    function sendReply(id: number, result: unknown) {
        write({ id, result: result ?? {} });
    }

    function sendError(id: number | undefined, code: number, message: string, detail?: string) {
        write({ id, error: { code, message, data: detail } });
    }

    function write(message: object) {
        if (!closed) {
            socket.send(JSON.stringify(message));
        }
    }
}

/**
 * What the pace judges of a decision: a forwarded command, or an evaluation run in an isolated world, which is how
 * agent-browser goes back and forward (`history.back()`). Anything else never loads a page.
 */
function findPacedCommand(decision: StealthDecision): CdpRequest | undefined {
    switch (decision.type) {
        case 'forward':
            return decision;
        case 'isolate':
            return decision.call.method === 'Runtime.evaluate' ? decision.call : undefined;
        default:
            return undefined;
    }
}
