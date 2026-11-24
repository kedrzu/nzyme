import { expect, test } from 'bun:test';

import type { CdpEvent } from './CdpTypes.js';
import { createSessionRegistry } from './createSessionRegistry.js';
import type { SessionOriginator } from './createSessionRegistry.js';

const CLIENT_A: SessionOriginator = { type: 'client', clientId: 'a' };
const CLIENT_B: SessionOriginator = { type: 'client', clientId: 'b' };

test('a popup belongs to the group of its opener and becomes its last used', () => {
    const registry = createSessionRegistry();
    registry.claimTarget('group-1', 'page-1');
    registry.claimTarget('group-1', 'page-2');

    registry.observe(targetCreated('popup-1', 'page-1'));
    registry.observe(targetCreated('stranger', 'page-unowned'));
    registry.observe(targetCreated('blank'));

    expect(registry.getTargetGroup('popup-1')).toBe('group-1');
    expect(registry.getTargetGroup('stranger')).toBeUndefined();
    expect(registry.getTargetGroup('blank')).toBeUndefined();
    expect(registry.getTargets('group-1')).toEqual(['page-1', 'page-2', 'popup-1']);
    expect(registry.lastUsed('group-1')).toBe('popup-1');
});

test('the attached event, arriving before the reply, gives the session to whoever is attaching', () => {
    const registry = createSessionRegistry();
    registry.expectAttach(CLIENT_B, 'page-2');
    const release = registry.expectAttach(CLIENT_A, 'page-1');

    registry.observe(attached('session-1', 'page-1'));
    release();

    expect(registry.getSessionOriginator('session-1')).toEqual(CLIENT_A);
    expect(registry.getSessionTarget('session-1')).toBe('page-1');
});

test('two attaches of one target are matched in the order they were sent', () => {
    const registry = createSessionRegistry();
    registry.expectAttach({ type: 'proxy' }, 'page-1');
    registry.expectAttach(CLIENT_A, 'page-1');

    registry.observe(attached('session-proxy', 'page-1'));
    registry.observe(attached('session-a', 'page-1'));

    expect(registry.getSessionOriginator('session-proxy')).toEqual({ type: 'proxy' });
    expect(registry.getSessionOriginator('session-a')).toEqual(CLIENT_A);
});

test("the proxy's held auto-attach of a new target leaves a pending client attach to the client's own event", () => {
    const registry = createSessionRegistry();
    registry.expectAttach(CLIENT_A, 'popup-1');

    registry.observe(attached('session-held', 'popup-1', undefined, true));
    registry.observe(attached('session-a', 'popup-1'));

    expect(registry.getSessionOriginator('session-held')).toBeUndefined();
    expect(registry.getSessionOriginator('session-a')).toEqual(CLIENT_A);
});

test('a released attach that got no event claims nothing later', () => {
    const registry = createSessionRegistry();
    const release = registry.expectAttach(CLIENT_A, 'page-1');
    release();

    registry.observe(attached('session-later', 'page-1'));

    expect(registry.getSessionOriginator('session-later')).toBeUndefined();
});

test('a child session inherits its parent session originator; an unclaimed parent passes nothing on', () => {
    const registry = createSessionRegistry();
    registry.claimSession(CLIENT_A, 'session-1', 'page-1');

    registry.observe(attached('child-1', 'worker-1', 'session-1'));
    registry.observe(attached('child-foreign', 'worker-2', 'session-unknown'));

    expect(registry.getSessionOriginator('child-1')).toEqual(CLIENT_A);
    expect(registry.getSessionOriginator('child-foreign')).toBeUndefined();
});

test('a top-level attach nobody asked for stays unowned', () => {
    const registry = createSessionRegistry();
    registry.claimSession(CLIENT_A, 'session-1', 'page-1');

    registry.observe(attached('session-foreign', 'page-1'));

    expect(registry.getSessionOriginator('session-foreign')).toBeUndefined();
});

test('detach forgets the session; destroy forgets the target and its sessions', () => {
    const registry = createSessionRegistry();
    registry.claimTarget('group-1', 'page-1');
    registry.claimTarget('group-1', 'page-2');
    registry.claimSession(CLIENT_A, 'session-1', 'page-1');
    registry.claimSession(CLIENT_A, 'session-2', 'page-2');
    registry.claimSession(CLIENT_B, 'session-3', 'page-2');

    registry.observe({ method: 'Target.detachedFromTarget', params: { sessionId: 'session-1' } });
    registry.observe({ method: 'Target.targetDestroyed', params: { targetId: 'page-2' } });

    expect(registry.getSessionOriginator('session-1')).toBeUndefined();
    expect(registry.getSessionOriginator('session-2')).toBeUndefined();
    expect(registry.getSessionOriginator('session-3')).toBeUndefined();
    expect(registry.getTargetGroup('page-2')).toBeUndefined();
    expect(registry.getTargets('group-1')).toEqual(['page-1']);
});

test('the last used page follows touches and falls back when it is destroyed', () => {
    const registry = createSessionRegistry();
    registry.claimTarget('group-1', 'page-1');
    registry.claimTarget('group-1', 'page-2');
    registry.claimTarget('group-2', 'page-3');
    expect(registry.lastUsed('group-1')).toBe('page-2');

    registry.touch('group-1', 'page-1');
    registry.touch('group-1', 'page-3');
    expect(registry.lastUsed('group-1')).toBe('page-1');

    registry.observe({ method: 'Target.targetDestroyed', params: { targetId: 'page-1' } });
    expect(registry.lastUsed('group-1')).toBe('page-2');
    expect(registry.lastUsed('group-3')).toBeUndefined();
});

function targetCreated(targetId: string, openerId?: string): CdpEvent {
    return { method: 'Target.targetCreated', params: { targetInfo: { targetId, type: 'page', openerId } } };
}

function attached(sessionId: string, targetId: string, parentSessionId?: string, waitingForDebugger = false): CdpEvent {
    return {
        method: 'Target.attachedToTarget',
        params: { sessionId, targetInfo: { targetId, type: 'page' }, waitingForDebugger },
        sessionId: parentSessionId,
    };
}
