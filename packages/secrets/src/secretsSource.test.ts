import { expect, test } from 'bun:test';

import { createMemoryStore } from './__fixtures__/createMemoryStore.js';
import { secretsSource } from './secretsSource.js';

test('loads every secret under the store prefix as entries by key, and names the store', async () => {
    const bw = createMemoryStore({ id: 'bw:DEV_', data: { DB_URL: 'db', API_KEY: 'api' } });

    const source = secretsSource(bw.store);

    expect(source.name).toBe('secrets:bw:DEV_');
    expect(await source.load()).toEqual({ DB_URL: 'db', API_KEY: 'api' });
});

test('a failing store read rejects the load', async () => {
    const source = secretsSource({
        id: 'broken',
        readAll: () => Promise.reject(new Error('Store unreachable')),
        write: () => Promise.resolve(),
    });

    await expect(source.load()).rejects.toThrow('Store unreachable');
});
