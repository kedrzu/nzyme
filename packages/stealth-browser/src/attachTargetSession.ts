import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

import type { SessionOriginator, SessionRegistry } from './createSessionRegistry.js';

/** What {@link attachTargetSession} attaches with and for whom. */
export interface AttachTargetSessionParams {
    /** Sends a CDP command on the browser's pipe. */
    send: (method: string, params?: object, sessionId?: string) => Promise<unknown>;
    registry: SessionRegistry;
    originator: SessionOriginator;
    targetId: string;
}

/**
 * Attaches a flat session to `targetId` for `originator`, announced to the registry first so the
 * `Target.attachedToTarget` event, which comes before the reply, is already claimed for it; returns the session id.
 * @util
 */
export async function attachTargetSession(params: AttachTargetSessionParams) {
    const { send, registry, originator, targetId } = params;
    const release = registry.expectAttach(originator, targetId);
    let reply: unknown;
    try {
        reply = await send('Target.attachToTarget', { targetId, flatten: true });
    } finally {
        release();
    }
    const sessionId = isPlainObject(reply) ? reply['sessionId'] : undefined;
    if (typeof sessionId !== 'string') {
        throw new TypeError('Target.attachToTarget gave no session id');
    }
    return sessionId;
}
