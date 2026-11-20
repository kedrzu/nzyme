import { describe, expect, test } from 'bun:test';

import { defineConfig } from '@nzyme/config/defineConfig.js';
import { loadConfig } from '@nzyme/config/loadConfig.js';
import { RuntimeConfig } from '@nzyme/config/RuntimeConfig.js';
import { createTestContainer } from '@nzyme/ioc-testing/createTestContainer.js';

import { createMemoryStore } from './__fixtures__/createMemoryStore.js';
import * as secrets from './__fixtures__/secrets.js';
import { defineSecret, isSecretDefinition, isSecretEnabled } from './defineSecret.js';
import { getSecretDefinitions } from './getSecretDefinitions.js';
import type { SecretStore, SecretStoreEntry } from './SecretStore.js';
import { secretsSource } from './secretsSource.js';

const SENTINEL = 'sentinel-secret-value-9c1e';

describe('defineSecret', () => {
    test('is a required string config key whose meta is flat: secret, description, enabled and the project metadata', () => {
        const secret = defineSecret('TOKEN', { description: 'A token', meta: { store: 'personal', rotate: 30 } });

        expect(secret.name).toBe('TOKEN');
        expect(secret.required).toBe(true);
        expect(secret.meta.secret).toBe(true);
        expect(secret.meta.description).toBe('A token');
        const store: 'personal' = secret.meta.store;
        const rotate: 30 = secret.meta.rotate;
        expect([store, rotate]).toEqual(['personal', 30]);
    });

    test('a project metadata key colliding with a reserved one is a type error, and loses at runtime', () => {
        const collisions = [
            // @ts-expect-error `secret` is reserved
            defineSecret('A', { meta: { secret: false } }),
            // @ts-expect-error `description` is reserved
            defineSecret('B', { meta: { description: 'x' } }),
            // @ts-expect-error `enabled` is reserved
            defineSecret('C', { meta: { enabled: false } }),
        ];

        expect(collisions.map(({ meta }) => [meta.secret, meta.description, typeof meta.enabled])).toEqual([
            [true, undefined, 'function'],
            [true, undefined, 'function'],
            [true, undefined, 'function'],
        ]);
    });

    test('resolves through a config document loaded from a secret store', async () => {
        const memory = createMemoryStore({ id: 'memory', data: { TOKEN: SENTINEL } });
        const { container } = createTestContainer();
        await loadConfig(container, [secretsSource(memory.store)]);

        expect(container.resolve(defineSecret('TOKEN'))).toBe(SENTINEL);
    });

    test('a missing secret throws naming the key and `secrets set`, never a value', () => {
        const { container } = createTestContainer();
        container.set(RuntimeConfig, { OTHER: SENTINEL });

        let message = '';
        try {
            container.resolve(defineSecret('TOKEN'));
        } catch (error) {
            message = error instanceof Error ? error.message : String(error);
        }

        expect(message).toStartWith(
            'Secret TOKEN is not set. Store it with `secrets set TOKEN`, or set it as an environment variable.',
        );
        expect(message).not.toContain(SENTINEL);
    });

    test('enabled defaults to true and receives the given env', () => {
        expect(isSecretEnabled(defineSecret('TOKEN'), {})).toBe(true);
        expect(isSecretEnabled(secrets.DB_PASSWORD, { ENV: 'production' })).toBe(true);
        expect(isSecretEnabled(secrets.DB_PASSWORD, { ENV: 'dev' })).toBe(false);
    });

    test('isSecretDefinition tells a secret from a plain config key and from non-definitions', () => {
        expect(isSecretDefinition(secrets.API_KEY)).toBe(true);
        expect(isSecretDefinition(defineConfig('X', { meta: { secret: false } }))).toBe(false);
        expect(isSecretDefinition({ meta: { secret: true } })).toBe(false);
        expect(isSecretDefinition(null)).toBe(false);
    });
});

describe('getSecretDefinitions', () => {
    test('collects only the secrets of a module, typed with the project metadata', () => {
        const definitions = getSecretDefinitions(secrets);

        expect(definitions.map(definition => definition.name)).toEqual(['API_KEY', 'DB_PASSWORD', 'GITHUB_TOKEN']);
        const stores: ('personal' | 'shared')[] = definitions.map(definition => definition.meta.store);
        expect(stores).toEqual(['shared', 'shared', 'personal']);
    });

    test('a store routed by project metadata sends reads and writes to the right store', async () => {
        const personal = createMemoryStore({ id: 'personal', data: { GITHUB_TOKEN: 'gh', API_KEY: 'stale' } });
        const shared = createMemoryStore({ id: 'shared', data: { API_KEY: 'api', DB_PASSWORD: 'db' } });
        const store = createRoutingStore({ personal: personal.store, shared: shared.store });

        expect(await store.readAll()).toEqual(
            new Map([
                ['API_KEY', 'api'],
                ['DB_PASSWORD', 'db'],
                ['GITHUB_TOKEN', 'gh'],
            ]),
        );

        await store.write([
            { key: 'GITHUB_TOKEN', value: 'gh2' },
            { key: 'API_KEY', value: 'api2' },
        ]);
        expect(personal.writes).toEqual([[{ key: 'GITHUB_TOKEN', value: 'gh2' }]]);
        expect(shared.writes).toEqual([[{ key: 'API_KEY', value: 'api2' }]]);
    });
});

/** A store over one store per `meta.store` value: each secret is read from and written to its own store. */
function createRoutingStore(stores: Record<'personal' | 'shared', SecretStore>): SecretStore {
    const storeOf = new Map(
        getSecretDefinitions(secrets).map(definition => [definition.name, stores[definition.meta.store]]),
    );

    return {
        id: 'routing',
        async readAll() {
            const result = new Map<string, string>();
            for (const [key, store] of storeOf) {
                const value = (await store.readAll()).get(key);
                if (value != null) {
                    result.set(key, value);
                }
            }

            return result;
        },
        async write(entries) {
            const byStore = new Map<SecretStore, SecretStoreEntry[]>();
            for (const entry of entries) {
                const store = storeOf.get(entry.key);
                if (!store) {
                    throw new Error(`Unknown secret ${entry.key}`);
                }

                byStore.set(store, [...(byStore.get(store) ?? []), entry]);
            }

            for (const [store, storeEntries] of byStore) {
                await store.write(storeEntries);
            }
        },
    };
}
