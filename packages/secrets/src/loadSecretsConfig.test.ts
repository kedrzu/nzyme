import { expect, test } from 'bun:test';

import { RuntimeConfig } from '@nzyme/config/RuntimeConfig.js';
import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import { createTestContainer } from '@nzyme/ioc-testing/createTestContainer.js';

import { createMemoryStore } from './__fixtures__/createMemoryStore.js';
import { defineSecret } from './defineSecret.js';
import { loadSecretsConfig } from './loadSecretsConfig.js';
import { resolveOptionalSecret } from './resolveOptionalSecret.js';

const API_KEY = defineSecret('API_KEY');
const DB_PASSWORD = defineSecret('DB_PASSWORD');
const ABSENT = defineSecret('ABSENT');

test('an environment variable wins over a store, and an earlier store over a later one', async () => {
    const first = createMemoryStore({ id: 'first', data: { API_KEY: 'stored-key', DB_PASSWORD: 'first-pass' } });
    const second = createMemoryStore({ id: 'second', data: { DB_PASSWORD: 'second-pass' } });
    const { container } = createTestContainer();
    container.set(EnvVariables, { API_KEY: 'shell-key' });

    await loadSecretsConfig(container, [first.store, second.store]);

    expect(container.resolve(API_KEY)).toBe('shell-key');
    expect(container.resolve(DB_PASSWORD)).toBe('first-pass');
});

test('with CI set the stores are not read and the values come from the environment', async () => {
    const store = createMemoryStore({ id: 'store', data: { API_KEY: 'stored-key' } });
    const { container } = createTestContainer();
    container.set(EnvVariables, { CI: 'true', DB_PASSWORD: 'job-pass' });

    await loadSecretsConfig(container, [store.store]);

    expect(store.reads).toBe(0);
    expect(container.resolve(DB_PASSWORD)).toBe('job-pass');
    expect(container.resolve(RuntimeConfig)).not.toHaveProperty('API_KEY');
});

test('resolveOptionalSecret returns the value, or undefined when the document lacks the secret', async () => {
    const { container } = createTestContainer();
    container.set(EnvVariables, { API_KEY: 'key' });
    await loadSecretsConfig(container, []);

    expect(resolveOptionalSecret(container, API_KEY)).toBe('key');
    expect(resolveOptionalSecret(container, ABSENT)).toBeUndefined();
    expect(() => container.resolve(ABSENT)).toThrow('Secret ABSENT is not set');
});
