import { describe, expect, it } from 'bun:test';

import { arrayRemoveDuplicates } from './arrayRemoveDuplicates.js';

describe('basic functionality with primitive types', () => {
    it('should remove duplicate numbers based on identity', () => {
        const array = [1, 2, 3, 2, 4, 1, 5];
        const result = arrayRemoveDuplicates(array, x => x);

        expect(result).toEqual([1, 2, 3, 4, 5]);
        expect(result).toBe(array); // Should mutate original array
    });

    it('should remove duplicate strings based on identity', () => {
        const array = ['apple', 'banana', 'apple', 'cherry', 'banana'];
        const result = arrayRemoveDuplicates(array, x => x);

        expect(result).toEqual(['apple', 'banana', 'cherry']);
        expect(result).toBe(array);
    });

    it('should preserve order and keep first occurrence', () => {
        const array = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3];
        const result = arrayRemoveDuplicates(array, x => x);

        expect(result).toEqual([3, 1, 4, 5, 9, 2, 6]);
    });
});

describe('object duplicate removal', () => {
    it('should remove duplicates based on object property', () => {
        const array = [
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' },
            { id: 1, name: 'Alice Duplicate' },
            { id: 3, name: 'Charlie' },
            { id: 2, name: 'Bob Duplicate' },
        ];
        const result = arrayRemoveDuplicates(array, item => item.id);

        expect(result).toEqual([
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' },
            { id: 3, name: 'Charlie' },
        ]);
    });

    it('should work with complex key extraction', () => {
        const array = [
            { user: { id: 1 }, score: 100 },
            { user: { id: 2 }, score: 200 },
            { user: { id: 1 }, score: 150 },
            { user: { id: 3 }, score: 300 },
        ];
        const result = arrayRemoveDuplicates(array, item => item.user.id);

        expect(result).toEqual([
            { user: { id: 1 }, score: 100 },
            { user: { id: 2 }, score: 200 },
            { user: { id: 3 }, score: 300 },
        ]);
    });

    it('should work with string-based keys', () => {
        const array = [
            { email: 'alice@example.com', role: 'admin' },
            { email: 'bob@example.com', role: 'user' },
            { email: 'alice@example.com', role: 'user' },
            { email: 'charlie@example.com', role: 'admin' },
        ];
        const result = arrayRemoveDuplicates(array, item => item.email);

        expect(result).toEqual([
            { email: 'alice@example.com', role: 'admin' },
            { email: 'bob@example.com', role: 'user' },
            { email: 'charlie@example.com', role: 'admin' },
        ]);
    });
});

describe('composite key extraction', () => {
    it('should work with composite keys using JSON.stringify', () => {
        const array = [
            { type: 'user', id: 1 },
            { type: 'admin', id: 1 },
            { type: 'user', id: 1 },
            { type: 'user', id: 2 },
            { type: 'admin', id: 1 },
        ];
        const result = arrayRemoveDuplicates(array, item => `${item.type}-${item.id}`);

        expect(result).toEqual([
            { type: 'user', id: 1 },
            { type: 'admin', id: 1 },
            { type: 'user', id: 2 },
        ]);
    });

    it('should work with object as key', () => {
        const array = [
            { coords: { x: 1, y: 2 }, value: 'A' },
            { coords: { x: 3, y: 4 }, value: 'B' },
            { coords: { x: 1, y: 2 }, value: 'C' },
            { coords: { x: 5, y: 6 }, value: 'D' },
        ];
        const result = arrayRemoveDuplicates(array, item => JSON.stringify(item.coords));

        expect(result).toEqual([
            { coords: { x: 1, y: 2 }, value: 'A' },
            { coords: { x: 3, y: 4 }, value: 'B' },
            { coords: { x: 5, y: 6 }, value: 'D' },
        ]);
    });
});

describe('edge cases', () => {
    it('should handle empty array', () => {
        const array: number[] = [];
        const result = arrayRemoveDuplicates(array, x => x);

        expect(result).toEqual([]);
        expect(result).toBe(array);
    });

    it('should handle single element array', () => {
        const array = [42];
        const result = arrayRemoveDuplicates(array, x => x);

        expect(result).toEqual([42]);
        expect(result).toBe(array);
    });

    it('should handle array with no duplicates', () => {
        const array = [1, 2, 3, 4, 5];
        const result = arrayRemoveDuplicates(array, x => x);

        expect(result).toEqual([1, 2, 3, 4, 5]);
        expect(result).toBe(array);
    });

    it('should handle array with all duplicates', () => {
        const array = [7, 7, 7, 7, 7];
        const result = arrayRemoveDuplicates(array, x => x);

        expect(result).toEqual([7]);
        expect(result).toBe(array);
    });

    it('should handle null and undefined values', () => {
        const array = [null, undefined, null, 'value', undefined, 'value'];
        const result = arrayRemoveDuplicates(array, x => x);

        expect(result).toEqual([null, undefined, 'value']);
    });

    it('should handle falsy values correctly', () => {
        const array = [0, false, '', null, undefined, 0, false, ''];
        const result = arrayRemoveDuplicates(array, x => x);

        expect(result).toEqual([0, false, '', null, undefined]);
    });
});

describe('key function behavior', () => {
    it('should work with key function returning null/undefined', () => {
        const array = [
            { id: 1, optional: 'value1' },
            { id: 2, optional: undefined },
            { id: 3, optional: 'value2' },
            { id: 4, optional: undefined },
            { id: 5, optional: null },
        ];
        const result = arrayRemoveDuplicates(array, item => item.optional);

        expect(result).toEqual([
            { id: 1, optional: 'value1' },
            { id: 2, optional: undefined },
            { id: 3, optional: 'value2' },
            { id: 5, optional: null },
        ]);
    });

    it('should work with key function returning boolean', () => {
        const array = [
            { active: true, name: 'A' },
            { active: false, name: 'B' },
            { active: true, name: 'C' },
            { active: false, name: 'D' },
        ];
        const result = arrayRemoveDuplicates(array, item => item.active);

        expect(result).toEqual([
            { active: true, name: 'A' },
            { active: false, name: 'B' },
        ]);
    });

    it('should work with key function returning objects', () => {
        const keyObj1 = { type: 'A' };
        const keyObj2 = { type: 'B' };

        const array = [
            { key: keyObj1, value: 1 },
            { key: keyObj2, value: 2 },
            { key: keyObj1, value: 3 }, // Same object reference
            { key: { type: 'A' }, value: 4 }, // Different object but same content
        ];
        const result = arrayRemoveDuplicates(array, item => item.key);

        // Should keep items with different object references, even if content is same
        expect(result).toHaveLength(3);
        expect(result[0]).toEqual({ key: keyObj1, value: 1 });
        expect(result[1]).toEqual({ key: keyObj2, value: 2 });
        expect(result[2]).toEqual({ key: { type: 'A' }, value: 4 });
    });
});

describe('type safety and generics', () => {
    it('should work with different generic types', () => {
        interface User {
            id: number;
            name: string;
            email: string;
        }

        const users: User[] = [
            { id: 1, name: 'Alice', email: 'alice@test.com' },
            { id: 2, name: 'Bob', email: 'bob@test.com' },
            { id: 1, name: 'Alice Updated', email: 'alice.new@test.com' },
        ];

        const result = arrayRemoveDuplicates(users, user => user.id);

        expect(result).toEqual([
            { id: 1, name: 'Alice', email: 'alice@test.com' },
            { id: 2, name: 'Bob', email: 'bob@test.com' },
        ]);
    });

    it('should work with mixed types when key function handles them', () => {
        const mixedArray = [
            'string1',
            { toString: () => 'string1' },
            'string2',
            { toString: () => 'string2' },
            'string1',
        ];

        const result = arrayRemoveDuplicates(mixedArray, item => (typeof item === 'string' ? item : item.toString()));

        expect(result).toHaveLength(2);
        expect(result[0]).toBe('string1');
        expect(result[1]).toBe('string2');
    });
});

describe('performance and large datasets', () => {
    it('should handle moderately large arrays efficiently', () => {
        const size = 1000;
        const array = Array.from({ length: size }, (_, i) => ({
            id: i % 100, // Creates 100 unique IDs with 10 duplicates each
            value: `value_${i}`,
        }));

        const result = arrayRemoveDuplicates(array, item => item.id);

        expect(result).toHaveLength(100);
        // Verify first occurrence of each ID is kept
        for (let i = 0; i < 100; i++) {
            expect(result.some(item => item.id === i && item.value === `value_${i}`)).toBe(true);
        }
    });
});

describe('array mutation verification', () => {
    it('should mutate the original array reference', () => {
        const original = [1, 2, 1, 3, 2, 4];
        const reference = original;

        const result = arrayRemoveDuplicates(original, x => x);

        expect(result).toBe(original);
        expect(result).toBe(reference);
        expect(original).toEqual([1, 2, 3, 4]);
    });

    it('should maintain correct length after mutation', () => {
        const array = [1, 1, 1, 2, 2, 3];
        expect(array.length).toBe(6);

        arrayRemoveDuplicates(array, x => x);

        expect(array.length).toBe(3);
        expect(array).toEqual([1, 2, 3]);
    });
});
