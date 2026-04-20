import { expect, test } from 'bun:test';

import { createLruCache } from './createLruCache.js';

test('set and get values', () => {
    const lru = createLruCache<string, number>({ maxSize: 3 });

    lru.set('a', 1);
    lru.set('b', 2);

    expect(lru.get('a')).toBe(1);
    expect(lru.get('b')).toBe(2);
    expect(lru.get('c')).toBeUndefined();
});

test('evicts oldest entry when at capacity', () => {
    const lru = createLruCache<string, number>({ maxSize: 3 });

    lru.set('a', 1);
    lru.set('b', 2);
    lru.set('c', 3);
    lru.set('d', 4); // should evict 'a'

    expect(lru.get('a')).toBeUndefined();
    expect(lru.get('b')).toBe(2);
    expect(lru.get('d')).toBe(4);
    expect(lru.size).toBe(3);
});

test('get moves entry to most recent position', () => {
    const lru = createLruCache<string, number>({ maxSize: 3 });

    lru.set('a', 1);
    lru.set('b', 2);
    lru.set('c', 3);

    // Access 'a' to make it most recent
    lru.get('a');

    // Now 'b' is oldest — should be evicted
    lru.set('d', 4);

    expect(lru.get('b')).toBeUndefined();
    expect(lru.get('a')).toBe(1);
    expect(lru.size).toBe(3);
});

test('set with existing key updates value and moves to most recent', () => {
    const lru = createLruCache<string, number>({ maxSize: 3 });

    lru.set('a', 1);
    lru.set('b', 2);
    lru.set('c', 3);

    // Update 'a' — should move to most recent
    lru.set('a', 10);

    // Now 'b' is oldest
    lru.set('d', 4);

    expect(lru.get('b')).toBeUndefined();
    expect(lru.get('a')).toBe(10);
    expect(lru.size).toBe(3);
});

test('has returns correct boolean', () => {
    const lru = createLruCache<string, number>({ maxSize: 3 });

    lru.set('a', 1);

    expect(lru.has('a')).toBe(true);
    expect(lru.has('b')).toBe(false);
});

test('delete removes entry and returns boolean', () => {
    const lru = createLruCache<string, number>({ maxSize: 3 });

    lru.set('a', 1);
    lru.set('b', 2);

    expect(lru.delete('a')).toBe(true);
    expect(lru.delete('a')).toBe(false);
    expect(lru.get('a')).toBeUndefined();
    expect(lru.size).toBe(1);
});

test('clear removes all entries', () => {
    const lru = createLruCache<string, number>({ maxSize: 3 });

    lru.set('a', 1);
    lru.set('b', 2);
    lru.set('c', 3);

    lru.clear();

    expect(lru.size).toBe(0);
    expect(lru.get('a')).toBeUndefined();
});

test('keys and values iterate in insertion order', () => {
    const lru = createLruCache<string, number>({ maxSize: 5 });

    lru.set('a', 1);
    lru.set('b', 2);
    lru.set('c', 3);

    expect([...lru.keys()]).toEqual(['a', 'b', 'c']);
    expect([...lru.values()]).toEqual([1, 2, 3]);
});

test('custom map is used as backing store', () => {
    const backingMap = new Map<string, number>();
    const lru = createLruCache<string, number>({ maxSize: 3, cache: backingMap });

    lru.set('a', 1);
    lru.set('b', 2);

    // Backing map should contain the entries
    expect(backingMap.get('a')).toBe(1);
    expect(backingMap.get('b')).toBe(2);
    expect(lru.cache).toBe(backingMap);
});

test('maxSize of 1 keeps only the latest entry', () => {
    const lru = createLruCache<string, number>({ maxSize: 1 });

    lru.set('a', 1);
    lru.set('b', 2);

    expect(lru.get('a')).toBeUndefined();
    expect(lru.get('b')).toBe(2);
    expect(lru.size).toBe(1);
});

test('get promotes entries with undefined values', () => {
    const lru = createLruCache<string, number | undefined>({ maxSize: 3 });

    lru.set('a', undefined);
    lru.set('b', 2);
    lru.set('c', 3);

    // Access 'a' to make it most recent — even though its value is undefined
    lru.get('a');

    // 'b' should now be the oldest and get evicted when we add 'd'
    lru.set('d', 4);

    expect(lru.has('a')).toBe(true);
    expect(lru.has('b')).toBe(false);
    expect(lru.has('c')).toBe(true);
    expect(lru.has('d')).toBe(true);
    expect(lru.size).toBe(3);
});

test('evicts oldest entry when oldest key is undefined', () => {
    const lru = createLruCache<undefined | string, number>({ maxSize: 2 });

    lru.set(undefined, 1);
    lru.set('b', 2);
    lru.set('c', 3); // should evict undefined key

    expect(lru.has(undefined)).toBe(false);
    expect(lru.has('b')).toBe(true);
    expect(lru.has('c')).toBe(true);
    expect(lru.size).toBe(2);
});
