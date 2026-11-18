import { expect, mock, test } from 'bun:test';

import { createTestLogger } from '@nzyme/logging/createTestLogger.js';

import type { CdpEvent } from './CdpTypes.js';
import { createBrandOverride } from './createBrandOverride.js';
import { createSessionRegistry } from './createSessionRegistry.js';

test("the browser's held auto-attach is claimed for the proxy, a client's attach is left alone", () => {
    const registry = createSessionRegistry();
    const send = mock((_method: string, _params?: object, _sessionId?: string) => Promise.resolve({}));
    const brand = createBrandOverride({ send, registry, logger: createTestLogger('test').logger });
    registry.claimSession({ type: 'client', clientId: 'a' }, 'session-client', 'page-2');

    for (const event of [attached('session-held', 'page-1'), attached('session-client', 'page-2')]) {
        registry.observe(event);
        brand.observe(event);
    }

    expect(registry.getSessionOriginator('session-held')).toEqual({ type: 'proxy' });
    expect(registry.getSessionOriginator('session-client')).toEqual({ type: 'client', clientId: 'a' });
    expect(send.mock.calls.map(([method, , sessionId]) => [method, sessionId])).toEqual([
        ['Runtime.runIfWaitingForDebugger', 'session-held'],
        ['Target.detachFromTarget', undefined],
    ]);
});

function attached(sessionId: string, targetId: string): CdpEvent {
    return {
        method: 'Target.attachedToTarget',
        params: { sessionId, targetInfo: { targetId, type: 'page' }, waitingForDebugger: true },
    };
}
