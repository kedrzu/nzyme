import { expect, test } from 'bun:test';

import { createTestLogger } from '@nzyme/logging/createTestLogger.js';

import { defineStack } from '../defineStack.js';
import type { StackDefinition } from '../defineStack.js';
import { filterStacks } from './filterStacks.js';

function defineTestStack(name: string, enabled = true): StackDefinition {
    return defineStack({
        name,
        enabled,
        resources: () => ({}),
    });
}

test('filterStacks: a glob and an exact name resolving to the same stack do not throw', () => {
    const { logger } = createTestLogger('test');
    const database = defineTestStack('database-eu-central-1');
    const dns = defineTestStack('dns-global');

    const result = filterStacks({
        stacks: [database, dns],
        // Both patterns resolve to `database-eu-central-1`; the exact name must still count as matched
        // even though the glob already added the stack.
        stackNames: ['database-*', 'database-eu-central-1'],
        logger,
    });

    expect([...result]).toEqual([database]);
});

test('filterStacks: a pattern matching no stack throws a usage error', () => {
    const { logger } = createTestLogger('test');
    const database = defineTestStack('database-eu-central-1');

    expect(() =>
        filterStacks({
            stacks: [database],
            stackNames: ['does-not-exist'],
            logger,
        }),
    ).toThrow('Pattern(s) does-not-exist did not match any stacks.');
});

test('filterStacks: empty stackNames returns all enabled stacks', () => {
    const { logger } = createTestLogger('test');
    const enabled = defineTestStack('database-eu-central-1');
    const disabled = defineTestStack('dns-global', false);

    const result = filterStacks({
        stacks: [enabled, disabled],
        stackNames: [],
        logger,
    });

    expect([...result]).toEqual([enabled]);
});
