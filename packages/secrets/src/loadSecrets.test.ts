import { expect, test } from 'bun:test';

import { defineScope } from '@nzyme/ioc/ContainerScope.js';
import { defineEnvVariable } from '@nzyme/ioc/defineEnvVariable.js';
import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import { createTestContainer } from '@nzyme/ioc-testing/createTestContainer.js';

import { createMemoryStore } from './__fixtures__/createMemoryStore.js';
import { loadSecrets } from './loadSecrets.js';
import type { SecretStore } from './SecretStore.js';

const SENTINEL = 'sentinel-secret-value-7f3a';

const TELEGRAM_TOKEN = defineEnvVariable('TELEGRAM_TOKEN');

test('loads every secret of every store, resolvable through defineEnvVariable', async () => {
    const one = createMemoryStore({ id: 'one', data: { TELEGRAM_TOKEN: SENTINEL, DB_PASSWORD: 'db-pass' } });
    const two = createMemoryStore({ id: 'two', data: { API_KEY: 'api' } });
    const { container, logs } = createTestContainer();
    const env: EnvVariables = {};
    container.set(EnvVariables, env);

    await loadSecrets(container, [one.store, two.store]);

    expect([one.reads, two.reads]).toEqual([1, 1]);
    expect(env).toEqual({ TELEGRAM_TOKEN: SENTINEL, DB_PASSWORD: 'db-pass', API_KEY: 'api' });
    expect(container.resolve(TELEGRAM_TOKEN)).toBe(SENTINEL);
    expect(logs.find(log => log.message === 'Secrets loaded')?.data).toEqual({
        loaded: ['TELEGRAM_TOKEN', 'DB_PASSWORD', 'API_KEY'],
        overridden: [],
    });
    expect(JSON.stringify(logs)).not.toContain(SENTINEL);
});

test('the earlier store wins a duplicate key, and an empty value does not block a later store', async () => {
    const first = createMemoryStore({ id: 'first', data: { A: 'from-first', B: '' } });
    const second = createMemoryStore({ id: 'second', data: { A: 'from-second', B: 'from-second', C: 'c' } });
    const { container } = createTestContainer();
    const env: EnvVariables = {};
    container.set(EnvVariables, env);

    await loadSecrets(container, [first.store, second.store]);

    expect(env).toEqual({ A: 'from-first', B: 'from-second', C: 'c' });
});

test('loads into the EnvVariables of a child container', async () => {
    const bw = createMemoryStore({ id: 'bw', data: { TELEGRAM_TOKEN: SENTINEL } });
    const { container } = createTestContainer();
    const rootEnv: EnvVariables = {};
    container.set(EnvVariables, rootEnv);
    const child = container.createChild(defineScope('request'));
    const childEnv: EnvVariables = {};
    child.set(EnvVariables, childEnv);

    await loadSecrets(child, [bw.store]);

    expect(child.resolve(TELEGRAM_TOKEN)).toBe(SENTINEL);
    expect(rootEnv).toEqual({});
});

test('a failing store read writes nothing, even from a store that was read', async () => {
    const fine = createMemoryStore({ id: 'fine', data: { TELEGRAM_TOKEN: SENTINEL } });
    const broken: SecretStore = {
        id: 'broken',
        prefix: '',
        readAll: () => Promise.reject(new Error('Store unreachable')),
        write: () => Promise.resolve(),
    };
    const { container, logs } = createTestContainer();
    const env: EnvVariables = {};
    container.set(EnvVariables, env);

    await expect(loadSecrets(container, [fine.store, broken])).rejects.toThrow('Store unreachable');

    expect(env).toEqual({});
    expect(JSON.stringify(logs)).not.toContain(SENTINEL);
});

test('a non-empty variable already set wins and is reported by name only', async () => {
    const bw = createMemoryStore({ id: 'bw', data: { TELEGRAM_TOKEN: SENTINEL, EMPTY_SET: 'fetched' } });
    const { container, logs } = createTestContainer();
    const env: EnvVariables = { TELEGRAM_TOKEN: 'local-token', EMPTY_SET: '' };
    container.set(EnvVariables, env);

    await loadSecrets(container, [bw.store]);

    expect(env).toEqual({ TELEGRAM_TOKEN: 'local-token', EMPTY_SET: 'fetched' });
    expect(logs.find(log => log.message === 'Secrets loaded')?.data).toEqual({
        loaded: ['EMPTY_SET'],
        overridden: ['TELEGRAM_TOKEN'],
    });
    expect(JSON.stringify(logs)).not.toContain(SENTINEL);
    expect(JSON.stringify(logs)).not.toContain('local-token');
});
