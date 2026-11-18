import { isPlainObject } from '@nzyme/utils/isPlainObject.js';

import type { CdpEvent } from './CdpTypes.js';
import { readTargetInfo } from './readTargetInfo.js';

/** Who opened a CDP session: a client (one socket) or the proxy itself. */
export type SessionOriginator = { type: 'client'; clientId: string } | { type: 'proxy' };

/**
 * Who may see what in the one browser: each page target belongs to one group, each CDP session to one originator. The
 * browser feeds it every event; client routing queries it and claims what its clients create.
 */
export interface SessionRegistry {
    /** Updates the registry from a browser event; call it with every event, before anyone else sees the event. */
    observe(event: CdpEvent): void;
    /** Gives a target to a group, e.g. the page a client's `Target.createTarget` made; counts as a use. */
    claimTarget(group: string, targetId: string): void;
    /**
     * Marks a target the proxy opened for itself, e.g. the page it reads the browser's identity in: no client sees or
     * names it, grouped or not. Forgotten once the target is destroyed.
     */
    claimProxyTarget(targetId: string): void;
    /** Whether a target is the proxy's own (`claimProxyTarget`). */
    isProxyTarget(targetId: string): boolean;
    /** Gives a session on `targetId` to an originator, e.g. from a `Target.attachToTarget` reply. */
    claimSession(originator: SessionOriginator, sessionId: string, targetId: string): void;
    /**
     * Records that `originator` is sending `Target.attachToTarget` for `targetId`, so the `Target.attachedToTarget`
     * event, which the browser sends before the reply, already claims the new session for it. Call it before sending;
     * the returned function forgets the attach if no event claimed it (call it once the reply, or an error, is in).
     */
    expectAttach(originator: SessionOriginator, targetId: string): () => void;
    /** The group a target belongs to; `undefined` for one no group owns (the proxy's, or unknown). */
    getTargetGroup(targetId: string): string | undefined;
    /** Every target of a group. */
    getTargets(group: string): string[];
    /** Who a session's events go to; `undefined` for a session nobody claimed. */
    getSessionOriginator(sessionId: string): SessionOriginator | undefined;
    /** The target a session is attached to. */
    getSessionTarget(sessionId: string): string | undefined;
    /** Marks a group's target as the one it used last. */
    touch(group: string, targetId: string): void;
    /** The group's target used, or claimed, last; `undefined` when it has none left. */
    lastUsed(group: string): string | undefined;
    /** Forgets everything; the browser is gone. */
    clear(): void;
}

/** A claimed session: whom its events go to and the target it is attached to. */
interface SessionRecord {
    originator: SessionOriginator;
    targetId: string;
}

/** A pending `Target.attachToTarget`. */
interface ExpectedAttach {
    originator: SessionOriginator;
}

/**
 * Creates the session registry of one browser run. A page opened by a page (a popup: `openerId`) belongs to its
 * opener's group and becomes the group's last used; a session auto-attached under another (`Target.attachedToTarget`
 * carrying the parent's `sessionId`) goes to the parent's originator, so a client sees its pages' workers and frames
 * and nothing of anyone else's.
 * @__NO_SIDE_EFFECTS__
 */
export function createSessionRegistry(): SessionRegistry {
    const targetGroups = new Map<string, string>();
    const proxyTargets = new Set<string>();
    const sessions = new Map<string, SessionRecord>();
    /** Pending top-level attaches per target, in the order they were sent: the browser answers the pipe in order. */
    const expectedAttaches = new Map<string, ExpectedAttach[]>();
    /** When each grouped target was last touched or claimed; the highest is the group's last used. */
    const touchedAt = new Map<string, number>();
    let clock = 0;

    return {
        observe,
        claimTarget,
        claimProxyTarget: targetId => {
            proxyTargets.add(targetId);
        },
        isProxyTarget: targetId => proxyTargets.has(targetId),
        claimSession,
        expectAttach,
        getTargetGroup: targetId => targetGroups.get(targetId),
        getTargets,
        getSessionOriginator: sessionId => sessions.get(sessionId)?.originator,
        getSessionTarget: sessionId => sessions.get(sessionId)?.targetId,
        touch,
        lastUsed,
        clear,
    };

    function observe(event: CdpEvent) {
        const params = isPlainObject(event.params) ? event.params : {};
        switch (event.method) {
            case 'Target.targetCreated':
                onTargetCreated(params);
                break;
            case 'Target.attachedToTarget':
                onAttached(params, event.sessionId);
                break;
            case 'Target.detachedFromTarget':
                if (typeof params['sessionId'] === 'string') {
                    sessions.delete(params['sessionId']);
                }
                break;
            case 'Target.targetDestroyed':
                if (typeof params['targetId'] === 'string') {
                    forgetTarget(params['targetId']);
                }
                break;
        }
    }

    function onTargetCreated(params: Record<string, unknown>) {
        const info = readTargetInfo(params);
        if (!info || info.type !== 'page' || info.openerId == null) {
            return;
        }
        const group = targetGroups.get(info.openerId);
        if (group != null) {
            claimTarget(group, info.targetId);
        }
    }

    function onAttached(params: Record<string, unknown>, parentSessionId: string | undefined) {
        const info = readTargetInfo(params);
        const sessionId = params['sessionId'];
        if (!info || typeof sessionId !== 'string') {
            return;
        }

        if (parentSessionId != null) {
            const parent = sessions.get(parentSessionId);
            if (parent) {
                sessions.set(sessionId, { originator: parent.originator, targetId: info.targetId });
            }
            return;
        }

        // An explicit `Target.attachToTarget` never waits for the debugger; a held new target is the proxy's
        // auto-attach.
        if (params['waitingForDebugger'] === true) {
            return;
        }
        const expected = expectedAttaches.get(info.targetId)?.shift();
        if (expected) {
            sessions.set(sessionId, { originator: expected.originator, targetId: info.targetId });
        }
    }

    function claimTarget(group: string, targetId: string) {
        targetGroups.set(targetId, group);
        touchedAt.set(targetId, ++clock);
    }

    function claimSession(originator: SessionOriginator, sessionId: string, targetId: string) {
        sessions.set(sessionId, { originator, targetId });
    }

    function expectAttach(originator: SessionOriginator, targetId: string) {
        const entry: ExpectedAttach = { originator };
        const queue = expectedAttaches.get(targetId) ?? [];
        queue.push(entry);
        expectedAttaches.set(targetId, queue);

        return () => {
            const current = expectedAttaches.get(targetId);
            if (!current) {
                return;
            }
            const index = current.indexOf(entry);
            if (index >= 0) {
                current.splice(index, 1);
            }
            if (current.length === 0) {
                expectedAttaches.delete(targetId);
            }
        };
    }

    function getTargets(group: string) {
        const targets: string[] = [];
        for (const [targetId, targetGroup] of targetGroups) {
            if (targetGroup === group) {
                targets.push(targetId);
            }
        }
        return targets;
    }

    function touch(group: string, targetId: string) {
        if (targetGroups.get(targetId) === group) {
            touchedAt.set(targetId, ++clock);
        }
    }

    function lastUsed(group: string) {
        let latest: string | undefined;
        let latestAt = -1;
        for (const targetId of getTargets(group)) {
            const at = touchedAt.get(targetId) ?? 0;
            if (at > latestAt) {
                latest = targetId;
                latestAt = at;
            }
        }
        return latest;
    }

    function forgetTarget(targetId: string) {
        targetGroups.delete(targetId);
        proxyTargets.delete(targetId);
        touchedAt.delete(targetId);
        expectedAttaches.delete(targetId);
        for (const [sessionId, session] of sessions) {
            if (session.targetId === targetId) {
                sessions.delete(sessionId);
            }
        }
    }

    function clear() {
        targetGroups.clear();
        proxyTargets.clear();
        sessions.clear();
        expectedAttaches.clear();
        touchedAt.clear();
    }
}
