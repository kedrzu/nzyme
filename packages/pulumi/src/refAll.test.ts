import { expect, test } from 'bun:test';

import { createContainer } from '@nzyme/ioc/Container.js';
import { getObjectKeys } from '@nzyme/utils/getObjectKeys.js';

import { defineStack } from './defineStack.js';
import type { StackDefinition, StackReference } from './defineStack.js';
import { refAll } from './refAll.js';

test('refAll exposes one dependency per stack (so the scheduler orders the consumer after all of them)', () => {
    const stacks: Record<string, StackDefinition> = {
        'eu-central-1': defineStack({
            name: 'api-eu-central-1',
            region: 'eu-central-1',
            resources: () => ({}),
        }),
        'us-east-1': defineStack({
            name: 'api-us-east-1',
            region: 'us-east-1',
            resources: () => ({}),
        }),
    };

    const all = refAll(stacks);

    expect(getObjectKeys(all.deps ?? {}).sort()).toEqual(['eu-central-1', 'us-east-1']);
});

test('refAll resolves to a reference map keyed by stack, each entry the reference for that exact stack', () => {
    // `enabled` is the per-stack discriminator: it flows from the stack definition into its
    // StackReference, so it proves each key maps to the reference of the *correct* stack — a key swap,
    // an empty map, or a wrong reference would change which `enabled` lands under which key.
    const stacks: Record<string, StackDefinition> = {
        'eu-central-1': defineStack({
            name: 'api-eu-central-1',
            region: 'eu-central-1',
            enabled: true,
            resources: () => ({}),
        }),
        'us-east-1': defineStack({
            name: 'api-us-east-1',
            region: 'us-east-1',
            enabled: false,
            resources: () => ({}),
        }),
    };

    const container = createContainer();
    const resolved: Record<string, StackReference> = container.resolve(refAll(stacks));

    // Exactly the expected keys, nothing extra, nothing missing.
    const expectedKeys: string[] = ['eu-central-1', 'us-east-1'];
    expect(getObjectKeys(resolved).sort()).toEqual(expectedKeys);

    // Each key maps to the StackReference of *that* stack, not a wrong/empty/swapped value.
    const euRef: StackReference | undefined = resolved['eu-central-1'];
    const usRef: StackReference | undefined = resolved['us-east-1'];

    expect(euRef?.enabled).toBe(true);
    expect(usRef?.enabled).toBe(false);
    expect(typeof euRef?.output).toBe('function');
    expect(typeof usRef?.output).toBe('function');
    expect(euRef).not.toBe(usRef);
});
