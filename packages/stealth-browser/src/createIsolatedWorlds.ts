import { assert } from '@nzyme/utils/assert.js';
import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

import { CdpError } from './CdpTypes.js';

/**
 * The isolated world every client's evaluation, resolved node and init script lands in unless the client names a world
 * it created itself, so page scripts never observe it. Pages never see world names; an ordinary one keeps it unremarkable anyway.
 */
export const ISOLATED_WORLD_NAME = 'utility';

/** An isolated world a client created with `Page.createIsolatedWorld`, as it asked for it. */
export interface ClientWorld {
    frameId: string;
    /** Never empty: an unnamed world is a new one on every call, so it could not be created again by name. */
    worldName: string;
    /** Chrome's own spelling. */
    grantUniveralAccess: boolean;
}

/**
 * A call to run in an isolated world. With `world`, in that world, created again; else in the proxy's world:
 * `DOM.resolveNode` in the world of the node's own frame, anything else in the world of the session's main frame.
 */
export interface IsolatedCall {
    method: string;
    /** The call's parameters, with no execution context named. */
    params: Record<string, unknown>;
    sessionId: string;
    /** The parameter naming the execution context: `contextId` for `Runtime.evaluate`, else `executionContextId`. */
    contextParam: 'contextId' | 'executionContextId';
    /** The client's own world the call named by the id it was given (`IsolatedWorlds.findClientWorld`). */
    world?: ClientWorld;
}

/** The proxy's isolated worlds as one client uses them. */
export interface IsolatedWorlds {
    /** Forgets a detached session, with the worlds its client created on it. */
    forget(sessionId: string): void;
    /**
     * Sends `call` with its context set to its world (`IsolatedCall`) in its frame, created (or, for the current
     * document, found) first. A navigation between the two invalidates the context; the call is then resolved again
     * and retried once.
     */
    send(call: IsolatedCall): Promise<unknown>;
    /** Creates a client's own world on `sessionId` and records it under the context id the reply gives the client. */
    createClientWorld(sessionId: string, world: ClientWorld): Promise<unknown>;
    /** The client's own world a context id it was given on `sessionId` names; none for any other id. */
    findClientWorld(sessionId: string, contextId: number): ClientWorld | undefined;
}

/** The browser's errors for a context or frame that went away with a navigation. */
const GONE_ERRORS = ['Cannot find context with specified id', 'No frame for given id found'];

/** The CDP error code of a method the target does not have: a worker has no Page domain. */
const METHOD_NOT_FOUND = -32_601;

/** Run on a node resolved in a frame's world: whether the node belongs to that frame's document. */
const IS_OWN_DOCUMENT = 'function () { return (this.ownerDocument ?? this) === document; }';

/** A node resolved in the world of one frame. */
interface Resolution {
    /** The browser's `DOM.resolveNode` reply. */
    reply: unknown;
    /** The resolved object; none when the frame's world cannot reach the node (a cross-origin frame's). */
    objectId?: string;
    /** Whether the node belongs to the frame's own document, so its world is the node's. */
    isOwn: boolean;
}

/**
 * Creates the isolated-world access of one client. Context ids are never cached, nor forwarded from the client:
 * Chrome reuses them across renderer processes, so after a cross-site navigation a remembered id can name the page's
 * own world. Each call asks `Page.createIsolatedWorld` again, which returns the existing world for the current
 * document; an id the client got for its own world only looks up which world to ask for.
 * @__NO_SIDE_EFFECTS__
 */
export function createIsolatedWorlds(
    sendCommand: (method: string, params?: object, sessionId?: string) => Promise<unknown>,
): IsolatedWorlds {
    /** The worlds clients created, by session, then by the context id the client was given. */
    const clientWorlds = new Map<string, Map<number, ClientWorld>>();

    return {
        forget: sessionId => {
            clientWorlds.delete(sessionId);
        },
        send,
        createClientWorld,
        findClientWorld: (sessionId, contextId) => clientWorlds.get(sessionId)?.get(contextId),
    };

    async function createClientWorld(sessionId: string, world: ClientWorld) {
        const reply = await sendCommand('Page.createIsolatedWorld', { ...world }, sessionId);
        const contextId = isPlainObject(reply) ? reply['executionContextId'] : undefined;
        if (typeof contextId === 'number') {
            const worlds = clientWorlds.get(sessionId) ?? new Map<number, ClientWorld>();
            worlds.set(contextId, world);
            clientWorlds.set(sessionId, worlds);
        }
        return reply;
    }

    async function send(call: IsolatedCall) {
        try {
            return await sendOnce(call);
        } catch (error) {
            if (!(error instanceof CdpError) || !GONE_ERRORS.some(message => error.message.includes(message))) {
                throw error;
            }
            return sendOnce(call);
        }
    }

    async function sendOnce(call: IsolatedCall) {
        if (call.world != null) {
            return sendInWorld(call, call.world);
        }
        const frames = await readFrames(call.sessionId);
        const [mainFrame] = frames;
        if (mainFrame == null) {
            throw new TypeError('Page.getFrameTree gave no main frame');
        }
        return call.method === 'DOM.resolveNode' ? resolveNode(call, frames) : sendInFrame(call, mainFrame);
    }

    /**
     * Resolves a node in the world of its own frame. A frame's world resolves a node of a same-origin frame too, but
     * with that frame's globals, and cannot reach a node of a cross-origin frame in the same process; so the main
     * frame's world is tried first, then every other frame's, until one owns the node. With none, the first object
     * resolved is kept.
     */
    async function resolveNode(call: IsolatedCall, frames: string[]) {
        const [mainFrame, ...otherFrames] = frames;
        assert(mainFrame != null);
        const main = await resolveInFrame(call, mainFrame);
        if (main.isOwn) {
            return main.reply;
        }
        let kept = main;
        for (const frameId of otherFrames) {
            let next: Resolution;
            try {
                next = await resolveInFrame(call, frameId);
            } catch (error) {
                // A frame that went away, or lives in another process, does not hold the node.
                if (error instanceof CdpError) {
                    continue;
                }
                throw error;
            }
            if (next.isOwn) {
                await releaseObject(call.sessionId, kept.objectId);
                return next.reply;
            }
            if (kept.objectId == null) {
                kept = next;
            } else {
                await releaseObject(call.sessionId, next.objectId);
            }
        }
        return kept.reply;
    }

    async function resolveInFrame(call: IsolatedCall, frameId: string): Promise<Resolution> {
        const reply = await sendInFrame(call, frameId);
        const object = isPlainObject(reply) ? reply['object'] : undefined;
        const objectId = isPlainObject(object) ? object['objectId'] : undefined;
        if (typeof objectId !== 'string') {
            return { reply, isOwn: false };
        }
        const checked = await sendCommand(
            'Runtime.callFunctionOn',
            { objectId, functionDeclaration: IS_OWN_DOCUMENT, returnByValue: true },
            call.sessionId,
        );
        const result = isPlainObject(checked) ? checked['result'] : undefined;
        return { reply, objectId, isOwn: isPlainObject(result) && result['value'] === true };
    }

    function sendInFrame(call: IsolatedCall, frameId: string) {
        return sendInWorld(call, { frameId, worldName: ISOLATED_WORLD_NAME, grantUniveralAccess: false });
    }

    async function sendInWorld(call: IsolatedCall, world: ClientWorld) {
        const { method, params, sessionId, contextParam } = call;
        const created = await sendCommand('Page.createIsolatedWorld', { ...world }, sessionId);
        const contextId = isPlainObject(created) ? created['executionContextId'] : undefined;
        if (typeof contextId !== 'number') {
            throw new TypeError('Page.createIsolatedWorld gave no context id');
        }
        return sendCommand(method, { ...params, [contextParam]: contextId }, sessionId);
    }

    async function releaseObject(sessionId: string, objectId: string | undefined) {
        if (objectId != null) {
            await sendCommand('Runtime.releaseObject', { objectId }, sessionId);
        }
    }

    /** The ids of the session's frames, the main frame first. */
    async function readFrames(sessionId: string) {
        let reply: unknown;
        try {
            reply = await sendCommand('Page.getFrameTree', {}, sessionId);
        } catch (error) {
            if (error instanceof CdpError && error.code === METHOD_NOT_FOUND) {
                throw new CdpError({ code: error.code, message: 'Code cannot run in a worker' });
            }
            throw error;
        }
        const frameIds: string[] = [];
        const pending: unknown[] = [isPlainObject(reply) ? reply['frameTree'] : undefined];
        while (pending.length > 0) {
            const tree = pending.shift();
            if (!isPlainObject(tree)) {
                continue;
            }
            const frame = tree['frame'];
            const frameId = isPlainObject(frame) ? frame['id'] : undefined;
            if (typeof frameId === 'string') {
                frameIds.push(frameId);
            }
            const children = tree['childFrames'];
            if (Array.isArray(children)) {
                const list: readonly unknown[] = children;
                pending.push(...list);
            }
        }
        return frameIds;
    }
}
