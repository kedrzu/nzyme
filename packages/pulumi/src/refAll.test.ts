import { expect, test } from 'bun:test';

import { getObjectKeys } from '@nzyme/utils/getObjectKeys.js';

import { defineStack } from './defineStack.js';
import type { StackDefinition } from './defineStack.js';
import { refAll } from './refAll.js';

test('refAll exposes one dependency per stack (so the scheduler orders the consumer after all of them)', () => {
    const stacks: Record<string, StackDefinition> = {
        'eu-central-1': defineStack({
            name: 'api',
            placement: { stackName: 'api-eu-central-1', region: 'eu-central-1' },
            resources: () => ({}),
        }),
        'us-east-1': defineStack({
            name: 'api',
            placement: { stackName: 'api-us-east-1', region: 'us-east-1' },
            resources: () => ({}),
        }),
    };

    const all = refAll(stacks);

    expect(getObjectKeys(all.deps ?? {}).sort()).toEqual(['eu-central-1', 'us-east-1']);
});
