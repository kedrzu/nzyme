import { expect, test } from 'bun:test';

import { defineStack } from '../defineStack.js';
import type { StackDefinition } from '../defineStack.js';
import type { RemoteStackInfo } from '../utils/listRemoteStacks.js';
import { isStackListed } from './isStackListed.js';

function defineTestStack(enabled: boolean): StackDefinition {
    return defineStack({ name: 'database', enabled, resources: () => ({}) });
}

const active: RemoteStackInfo = { name: 'database', isDestroyed: false, resourceCount: 3 };
const destroyed: RemoteStackInfo = { name: 'database', isDestroyed: true, resourceCount: 0 };

test('isStackListed: hides a disabled stack with no remote state', () => {
    expect(isStackListed({ stack: defineTestStack(false), remote: undefined, remoteKnown: true, all: false })).toBe(
        false,
    );
});

test('isStackListed: hides a disabled stack whose remote state is destroyed', () => {
    expect(isStackListed({ stack: defineTestStack(false), remote: destroyed, remoteKnown: true, all: false })).toBe(
        false,
    );
});

test('isStackListed: shows a disabled stack that still holds resources', () => {
    expect(isStackListed({ stack: defineTestStack(false), remote: active, remoteKnown: true, all: false })).toBe(true);
});

test('isStackListed: shows an enabled stack whatever its remote state', () => {
    const stack = defineTestStack(true);

    expect(isStackListed({ stack, remote: undefined, remoteKnown: true, all: false })).toBe(true);
    expect(isStackListed({ stack, remote: destroyed, remoteKnown: true, all: false })).toBe(true);
    expect(isStackListed({ stack, remote: active, remoteKnown: true, all: false })).toBe(true);
});

test('isStackListed: --all shows a disabled stack that was never deployed', () => {
    expect(isStackListed({ stack: defineTestStack(false), remote: undefined, remoteKnown: true, all: true })).toBe(
        true,
    );
    expect(isStackListed({ stack: defineTestStack(false), remote: destroyed, remoteKnown: true, all: true })).toBe(
        true,
    );
});

test('isStackListed: shows a disabled stack when the remote state is unknown', () => {
    expect(isStackListed({ stack: defineTestStack(false), remote: undefined, remoteKnown: false, all: false })).toBe(
        true,
    );
});
