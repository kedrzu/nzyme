import { expect, test } from 'bun:test';

import { UsageError } from '@nzyme/cli-core';

import { createMemoryStore } from './__fixtures__/createMemoryStore.js';
import { defineSecret } from './defineSecret.js';
import { resolveSecretTarget } from './resolveSecretTarget.js';
import { secretsProvider } from './commands/secretsProvider.js';

const DECLARED = defineSecret('DECLARED');
const DISABLED = defineSecret('DISABLED', { enabled: env => env.ENABLE_IT === '1' });

test('returns the provider target for a declared, enabled name', () => {
    const { store } = createMemoryStore({ id: 'main' });
    const provider = secretsProvider({ secrets: [DECLARED, DISABLED], store });

    expect(resolveSecretTarget({ provider, env: {}, name: 'DECLARED' })).toBe(store);
    expect(resolveSecretTarget({ provider, env: { ENABLE_IT: '1' }, name: 'DISABLED' })).toBe(store);
});

test.each([
    ['UNDECLARED', 'Refusing to write UNDECLARED: it is not declared with defineSecret.'],
    ['DISABLED', 'Refusing to write DISABLED: it is not enabled in this environment.'],
])('refuses %s without asking the provider for a target', (name, message) => {
    const { store } = createMemoryStore({ id: 'main' });
    let asked = 0;
    const provider = {
        ...secretsProvider({ secrets: [DECLARED, DISABLED], store }),
        target: () => {
            asked++;
            return store;
        },
    };

    expect(() => resolveSecretTarget({ provider, env: {}, name })).toThrow(new UsageError(message));
    expect(asked).toBe(0);
});

test('without declarations any name goes to the provider target', () => {
    const { store } = createMemoryStore({ id: 'main' });

    expect(resolveSecretTarget({ provider: { stores: [store], target: () => store }, env: {}, name: 'ANY' })).toBe(
        store,
    );
});
