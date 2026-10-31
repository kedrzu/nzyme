import { expect, test } from 'bun:test';
import { nextTick } from 'vue';

import { storageRef } from './storageRef.js';
import type { StorageLike } from './storageRef.js';

test('returns the default when the given storage is empty', () => {
    const storage = createMapStorage();

    const value = storageRef({ key: 'theme', storage, default: () => 'light' });

    expect(value.value).toBe('light');
});

test('reads the initial value from the given storage', () => {
    const storage = createMapStorage({ settings: '{"size":14}' });

    const value = storageRef<{ size: number }>({ key: 'settings', storage, json: true });

    expect(value.value).toEqual({ size: 14 });
});

test('writes changes to the given storage', async () => {
    const storage = createMapStorage();
    const value = storageRef<{ size: number }>({ key: 'settings', storage, json: true });

    value.value = { size: 16 };
    await nextTick();

    expect(storage.getItem('settings')).toBe('{"size":16}');
});

test('reload picks up a value written to the given storage elsewhere', () => {
    const storage = createMapStorage({ theme: 'light' });
    const value = storageRef({ key: 'theme', storage });

    storage.setItem('theme', 'dark');
    value.reload();

    expect(value.value).toBe('dark');
});

test('clear restores the default and removes the key from the given storage', async () => {
    const storage = createMapStorage({ theme: 'dark' });
    const value = storageRef({ key: 'theme', storage });

    value.clear();
    await nextTick();

    expect(value.value).toBeNull();
    expect(storage.getItem('theme')).toBeNull();
});

test("keeps using the global localStorage when storage is 'local' or omitted", async () => {
    const global = createMapStorage({ theme: 'dark' });
    Object.defineProperty(globalThis, 'localStorage', { value: global, configurable: true });

    try {
        const explicit = storageRef({ key: 'theme', storage: 'local' });
        const implicit = storageRef({ key: 'size' });

        implicit.value = '16';
        await nextTick();

        expect(explicit.value).toBe('dark');
        expect(global.getItem('size')).toBe('16');
    } finally {
        Reflect.deleteProperty(globalThis, 'localStorage');
    }
});

function createMapStorage(initial: Record<string, string> = {}): StorageLike {
    const items = new Map(Object.entries(initial));

    return {
        getItem: key => items.get(key) ?? null,
        setItem: (key, value) => {
            items.set(key, value);
        },
        removeItem: key => {
            items.delete(key);
        },
    };
}
