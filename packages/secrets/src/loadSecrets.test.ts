import { expect, test } from 'bun:test';

import { defineScope } from '@nzyme/ioc/ContainerScope.js';
import { defineEnvVariable } from '@nzyme/ioc/defineEnvVariable.js';
import { EnvVariables } from '@nzyme/ioc/helpers/EnvVariables.js';
import { defineService } from '@nzyme/ioc/Service.js';
import { createTestContainer } from '@nzyme/ioc-testing/createTestContainer.js';

import { loadSecrets } from './loadSecrets.js';
import type { SecretsMapping } from './SecretsMapping.js';
import type { SecretStore } from './SecretStore.js';

const SENTINEL = 'sentinel-secret-value-7f3a';

const TELEGRAM_TOKEN = defineEnvVariable('TELEGRAM_TOKEN');

test('loads secrets with one read of the store, a shared key read once, resolvable through defineEnvVariable', async () => {
    const bw = createMemoryStore('bw', { TELEGRAM_TOKEN_UMBRA: SENTINEL, DB_PASSWORD: 'db-pass', API_KEY: 'api' });
    const { container, logs } = createTestContainer();
    const env: EnvVariables = {};
    container.set(EnvVariables, env);
    const provider = defineAppSecrets({
        store: bw.store,
        secrets: {
            TELEGRAM_TOKEN: 'TELEGRAM_TOKEN_UMBRA',
            DB_PASSWORD: 'DB_PASSWORD',
            API_KEY: 'API_KEY',
            LEGACY_API_KEY: 'API_KEY',
        },
    });

    await loadSecrets(container, provider);

    expect(bw.reads).toEqual([['TELEGRAM_TOKEN_UMBRA', 'DB_PASSWORD', 'API_KEY']]);
    expect(env).toEqual({
        TELEGRAM_TOKEN: SENTINEL,
        DB_PASSWORD: 'db-pass',
        API_KEY: 'api',
        LEGACY_API_KEY: 'api',
    });
    expect(container.resolve(TELEGRAM_TOKEN)).toBe(SENTINEL);
    expect(logs.find(log => log.message === 'Secrets loaded')?.data).toEqual({
        loaded: ['TELEGRAM_TOKEN', 'DB_PASSWORD', 'API_KEY', 'LEGACY_API_KEY'],
        overridden: [],
    });
    expect(JSON.stringify(logs)).not.toContain(SENTINEL);
});

test('loads into the EnvVariables of a child container', async () => {
    const bw = createMemoryStore('bw', { TELEGRAM_TOKEN_UMBRA: SENTINEL });
    const { container } = createTestContainer();
    const rootEnv: EnvVariables = {};
    container.set(EnvVariables, rootEnv);
    const child = container.createChild(defineScope('request'));
    const childEnv: EnvVariables = {};
    child.set(EnvVariables, childEnv);
    const provider = defineAppSecrets({
        store: bw.store,
        secrets: { TELEGRAM_TOKEN: 'TELEGRAM_TOKEN_UMBRA' },
    });

    await loadSecrets(child, provider);

    expect(child.resolve(TELEGRAM_TOKEN)).toBe(SENTINEL);
    expect(rootEnv).toEqual({});
});

test('a missing or empty secret fails naming it and its reference, writing nothing', async () => {
    const bw = createMemoryStore('bw', { PRESENT: SENTINEL, EMPTY: '' });
    const { container, logs } = createTestContainer();
    const env: EnvVariables = {};
    container.set(EnvVariables, env);
    const provider = defineAppSecrets({
        store: bw.store,
        secrets: { PRESENT: 'PRESENT', EMPTY_ONE: 'EMPTY', ABSENT_ONE: 'ABSENT' },
    });

    const error = await loadSecrets(container, provider).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    const message = String(error);
    expect(message).toContain('EMPTY_ONE (key EMPTY in store bw)');
    expect(message).toContain('ABSENT_ONE (key ABSENT in store bw)');
    expect(message).not.toContain('PRESENT');
    expect(message).not.toContain(SENTINEL);
    expect(env).toEqual({});
    expect(JSON.stringify(logs)).not.toContain(SENTINEL);
});

test('a failing store read writes nothing', async () => {
    const broken: SecretStore = {
        id: 'broken',
        read: () => Promise.reject(new Error('Store unreachable')),
        write: () => Promise.resolve(),
    };
    const { container } = createTestContainer();
    const env: EnvVariables = {};
    container.set(EnvVariables, env);
    const provider = defineAppSecrets({ store: broken, secrets: { TELEGRAM_TOKEN: 'TELEGRAM_TOKEN' } });

    await expect(loadSecrets(container, provider)).rejects.toThrow('Store unreachable');

    expect(env).toEqual({});
});

test('a non-empty variable already set wins and is reported by name only', async () => {
    const bw = createMemoryStore('bw', { TELEGRAM_TOKEN: SENTINEL, EMPTY_SET: 'fetched' });
    const { container, logs } = createTestContainer();
    const env: EnvVariables = { TELEGRAM_TOKEN: 'local-token', EMPTY_SET: '' };
    container.set(EnvVariables, env);
    const provider = defineAppSecrets({
        store: bw.store,
        secrets: { TELEGRAM_TOKEN: 'TELEGRAM_TOKEN', EMPTY_SET: 'EMPTY_SET' },
    });

    await loadSecrets(container, provider);

    expect(env).toEqual({ TELEGRAM_TOKEN: 'local-token', EMPTY_SET: 'fetched' });
    expect(bw.reads).toEqual([['EMPTY_SET']]);
    expect(logs.find(log => log.message === 'Secrets loaded')?.data).toEqual({
        loaded: ['EMPTY_SET'],
        overridden: ['TELEGRAM_TOKEN'],
    });
    expect(JSON.stringify(logs)).not.toContain(SENTINEL);
    expect(JSON.stringify(logs)).not.toContain('local-token');
});

function defineAppSecrets(mapping: SecretsMapping) {
    return defineService<SecretsMapping>({ name: 'AppSecrets', setup: () => mapping });
}

function createMemoryStore(id: string, data: Record<string, string>) {
    const reads: string[][] = [];
    const store: SecretStore = {
        id,
        read(keys) {
            reads.push(keys);
            const found = new Map<string, string>();
            for (const key of keys) {
                const value = data[key];
                if (value !== undefined) {
                    found.set(key, value);
                }
            }
            return Promise.resolve(found);
        },
        write: () => Promise.resolve(),
    };

    return { store, reads };
}
