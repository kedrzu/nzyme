import { expect, test } from 'bun:test';

import { toJson } from './toJson.js';
import type { Json } from './toJson.js';

// ============================================================================
// NULL AND UNDEFINED
// ============================================================================

test('converts null to null', () => {
    const result = toJson(null);
    expect(result).toBe(null);
});

test('converts undefined to null', () => {
    const result = toJson(undefined);
    expect(result).toEqual(null);
});

// ============================================================================
// PRIMITIVES
// ============================================================================

test('converts string primitives unchanged', () => {
    const result = toJson('hello');
    expect(result).toBe('hello');
});

test('converts number primitives unchanged', () => {
    const result = toJson(42);
    expect(result).toBe(42);
});

test('converts boolean primitives unchanged', () => {
    expect(toJson(true)).toBe(true);
    expect(toJson(false)).toBe(false);
});

// ============================================================================
// BIGINT
// ============================================================================

test('converts bigint to string', () => {
    const result = toJson(123456789012345678901234567890n);
    expect(result).toBe('123456789012345678901234567890');
    expect(typeof result).toBe('string');
});

test('converts negative bigint to string', () => {
    const result = toJson(-999n);
    expect(result).toBe('-999');
});

test('converts zero bigint to string', () => {
    const result = toJson(0n);
    expect(result).toBe('0');
});

// ============================================================================
// FUNCTIONS
// ============================================================================

test('converts function to undefined', () => {
    const result = toJson(() => 'test');
    expect(result).toBe(undefined);
});

test('converts arrow function to undefined', () => {
    const result = toJson((x: number) => x + 1);
    expect(result).toBe(undefined);
});

// ============================================================================
// ARRAYS
// ============================================================================

test('converts empty array', () => {
    const result = toJson([]);
    expect(result).toEqual([]);
});

test('converts array of primitives', () => {
    const result = toJson([1, 'two', true, null]);
    expect(result).toEqual([1, 'two', true, null]);
});

test('converts array with nested arrays', () => {
    const result = toJson([1, [2, [3, 4]], 5]);
    expect(result).toEqual([1, [2, [3, 4]], 5]);
});

test('converts array with bigints', () => {
    const result = toJson([1n, 2n, 3n]);
    expect(result).toEqual(['1', '2', '3']);
});

test('converts array with mixed types including bigint', () => {
    const result = toJson([1, 'str', 2n, true]);
    expect(result).toEqual([1, 'str', '2', true]);
});

// ============================================================================
// SET
// ============================================================================

test('converts empty Set to empty array', () => {
    const result = toJson(new Set());
    expect(result).toEqual([]);
});

test('converts Set of primitives to array', () => {
    const result = toJson(new Set([1, 2, 3]));
    expect(result).toEqual([1, 2, 3]);
});

test('converts Set of strings to array', () => {
    const result = toJson(new Set(['a', 'b', 'c']));
    expect(result).toEqual(['a', 'b', 'c']);
});

test('converts Set with bigints', () => {
    const result = toJson(new Set([1n, 2n, 3n]));
    expect(result).toEqual(['1', '2', '3']);
});

test('converts Set with nested objects', () => {
    const result = toJson(new Set([{ a: 1 }, { b: 2 }]));
    expect(result).toEqual([{ a: 1 }, { b: 2 }]);
});

test('converts Set with mixed types', () => {
    const result = toJson(new Set([1, 5n, null, 'str', true]));
    expect(result).toEqual([1, '5', null, 'str', true]);
});

// ============================================================================
// MAP
// ============================================================================

test('converts empty Map to empty array', () => {
    const result = toJson(new Map());
    expect(result).toEqual([]);
});

test('converts Map with string keys and primitive values', () => {
    const map = new Map([
        ['a', 1],
        ['b', 2],
    ]);
    const result = toJson(map);
    expect(result).toEqual([
        ['a', 1],
        ['b', 2],
    ]);
});

test('converts Map with number keys', () => {
    const map = new Map([
        [1, 'one'],
        [2, 'two'],
    ]);
    const result = toJson(map);
    expect(result).toEqual([
        [1, 'one'],
        [2, 'two'],
    ]);
});

test('converts Map with bigint values', () => {
    const map = new Map([
        ['a', 1n],
        ['b', 2n],
    ]);
    const result = toJson(map);
    expect(result).toEqual([
        ['a', '1'],
        ['b', '2'],
    ]);
});

test('converts Map with object values', () => {
    const map = new Map([
        ['key1', { x: 1 }],
        ['key2', { y: 2 }],
    ]);
    const result = toJson(map);
    expect(result).toEqual([
        ['key1', { x: 1 }],
        ['key2', { y: 2 }],
    ]);
});

test('converts Map with nested Maps as values', () => {
    const innerMap = new Map([['inner', 'value']]);
    const outerMap = new Map([['outer', innerMap]]);
    const result = toJson(outerMap);
    expect(result).toEqual([['outer', [['inner', 'value']]]]);
});

// ============================================================================
// MAP WITH COMPLEX KEYS (Issue #2)
// ============================================================================

test('converts Map with bigint keys', () => {
    const map = new Map<bigint, string>([
        [1n, 'one'],
        [2n, 'two'],
    ]);
    const result = toJson(map);
    // Keys should be converted through toJson, so bigint becomes string
    expect(result).toEqual([
        ['1', 'one'],
        ['2', 'two'],
    ]);
});

test('converts Map with Date keys', () => {
    const date1 = new Date('2024-01-01T00:00:00.000Z');
    const date2 = new Date('2024-12-31T23:59:59.999Z');
    const map = new Map<Date, string>([
        [date1, 'start'],
        [date2, 'end'],
    ]);
    const result = toJson(map);
    // Keys should be converted through toJson, so Date becomes ISO string
    expect(result).toEqual([
        ['2024-01-01T00:00:00.000Z', 'start'],
        ['2024-12-31T23:59:59.999Z', 'end'],
    ]);
});

test('converts Map with object keys', () => {
    const key1 = { id: 1, value: 10n };
    const key2 = { id: 2, value: 20n };
    const map = new Map<object, string>([
        [key1, 'first'],
        [key2, 'second'],
    ]);
    const result = toJson(map);
    // Keys should be converted through toJson
    expect(result).toEqual([
        [{ id: 1, value: '10' }, 'first'],
        [{ id: 2, value: '20' }, 'second'],
    ]);
});

test('converts Map with nested Map keys', () => {
    const innerMap1 = new Map([['a', 1]]);
    const innerMap2 = new Map([['b', 2]]);
    const outerMap = new Map<Map<string, number>, string>([
        [innerMap1, 'first'],
        [innerMap2, 'second'],
    ]);
    const result = toJson(outerMap);
    expect(result).toEqual([
        [[['a', 1]], 'first'],
        [[['b', 2]], 'second'],
    ]);
});

// ============================================================================
// DATE (Issue #1)
// ============================================================================

test('converts Date to ISO string', () => {
    const date = new Date('2024-01-15T10:30:00.000Z');
    const result = toJson(date);
    expect(result).toBe('2024-01-15T10:30:00.000Z');
    expect(typeof result).toBe('string');
});

test('converts Date with milliseconds to ISO string', () => {
    const date = new Date('2024-12-31T23:59:59.999Z');
    const result = toJson(date);
    expect(result).toBe('2024-12-31T23:59:59.999Z');
});

test('converts epoch Date to ISO string', () => {
    const date = new Date(0);
    const result = toJson(date);
    expect(result).toBe('1970-01-01T00:00:00.000Z');
});

test('converts recent Date to ISO string', () => {
    const date = new Date('2023-06-15T14:22:33.123Z');
    const result = toJson(date);
    expect(result).toBe('2023-06-15T14:22:33.123Z');
});

// ============================================================================
// OBJECTS
// ============================================================================

test('converts empty object', () => {
    const result = toJson({});
    expect(result).toEqual({});
});

test('converts simple object', () => {
    const result = toJson({ a: 1, b: 'two', c: true });
    expect(result).toEqual({ a: 1, b: 'two', c: true });
});

test('converts object with null values', () => {
    const result = toJson({ a: null, b: undefined });
    expect(result).toEqual({ a: null, b: null });
});

test('converts object with bigint property', () => {
    const result = toJson({ id: 123n, name: 'test' });
    expect(result).toEqual({ id: '123', name: 'test' });
});

test('converts object with Date property', () => {
    const date = new Date('2024-01-01T00:00:00.000Z');
    const result = toJson({ created: date, name: 'test' });
    expect(result).toEqual({ created: '2024-01-01T00:00:00.000Z', name: 'test' });
});

test('converts nested objects', () => {
    const result = toJson({
        outer: {
            inner: {
                deep: 'value',
            },
        },
    });
    expect(result).toEqual({
        outer: {
            inner: {
                deep: 'value',
            },
        },
    });
});

test('converts object with array property', () => {
    const result = toJson({ items: [1, 2, 3] });
    expect(result).toEqual({ items: [1, 2, 3] });
});

test('converts object with Set property', () => {
    const result = toJson({ tags: new Set(['a', 'b', 'c']) });
    expect(result).toEqual({ tags: ['a', 'b', 'c'] });
});

test('converts object with Map property', () => {
    const map = new Map([
        ['key1', 'value1'],
        ['key2', 'value2'],
    ]);
    const result = toJson({ data: map });
    expect(result).toEqual({
        data: [
            ['key1', 'value1'],
            ['key2', 'value2'],
        ],
    });
});

test('converts object with function property', () => {
    const result = toJson({ fn: () => 'test', value: 42 });
    expect(result).toEqual({ fn: undefined, value: 42 });
});

// ============================================================================
// COMPLEX NESTED STRUCTURES
// ============================================================================

test('converts complex nested structure with all types', () => {
    const date = new Date('2024-01-01T00:00:00.000Z');
    const map = new Map<string, bigint | Date>([
        ['key1', 100n],
        ['key2', date],
    ]);
    const set = new Set([1, 2, 3]);

    const result = toJson({
        id: 999n,
        created: date,
        tags: set,
        metadata: map,
        nested: {
            array: [1, 'two', 3n, null],
            innerDate: date,
        },
        fn: () => 'ignored',
    });

    expect(result).toEqual({
        id: '999',
        created: '2024-01-01T00:00:00.000Z',
        tags: [1, 2, 3],
        metadata: [
            ['key1', '100'],
            ['key2', '2024-01-01T00:00:00.000Z'],
        ],
        nested: {
            array: [1, 'two', '3', null],
            innerDate: '2024-01-01T00:00:00.000Z',
        },
        fn: undefined,
    });
});

test('converts array containing Date objects', () => {
    const dates = [new Date('2024-01-01T00:00:00.000Z'), new Date('2024-12-31T23:59:59.999Z')];
    const result = toJson(dates);
    expect(result).toEqual(['2024-01-01T00:00:00.000Z', '2024-12-31T23:59:59.999Z']);
});

test('converts Set containing Date objects', () => {
    const dates = new Set([new Date('2024-01-01T00:00:00.000Z'), new Date('2024-06-15T12:00:00.000Z')]);
    const result = toJson(dates);
    expect(result).toEqual(['2024-01-01T00:00:00.000Z', '2024-06-15T12:00:00.000Z']);
});

test('converts Map with Date values', () => {
    const map = new Map([
        ['end', new Date('2024-12-31T23:59:59.999Z')],
        ['start', new Date('2024-01-01T00:00:00.000Z')],
    ]);
    const result = toJson(map);
    expect(result).toEqual([
        ['end', '2024-12-31T23:59:59.999Z'],
        ['start', '2024-01-01T00:00:00.000Z'],
    ]);
});

test('converts object with bigint in nested array', () => {
    const result = toJson({
        data: {
            values: [1n, 2n, 3n],
        },
    });
    expect(result).toEqual({
        data: {
            values: ['1', '2', '3'],
        },
    });
});

test('converts Map with nested objects containing Dates and bigints', () => {
    const map = new Map([
        [
            'user1',
            {
                id: 100n,
                created: new Date('2024-01-01T00:00:00.000Z'),
            },
        ],
        [
            'user2',
            {
                id: 200n,
                created: new Date('2024-02-01T00:00:00.000Z'),
            },
        ],
    ]);
    const result = toJson(map);
    expect(result).toEqual([
        [
            'user1',
            {
                id: '100',
                created: '2024-01-01T00:00:00.000Z',
            },
        ],
        [
            'user2',
            {
                id: '200',
                created: '2024-02-01T00:00:00.000Z',
            },
        ],
    ]);
});

// ============================================================================
// TYPE SAFETY CHECKS
// ============================================================================

test('type safety: Json<Date> is DateTimeISO (string)', () => {
    const date = new Date();
    const result: Json<Date> = toJson(date);
    // This should compile and result should be a string
    const _check: string = result;
    expect(typeof result).toBe('string');
});

test('type safety: Json<bigint> is string', () => {
    const big = 123n;
    const result: Json<bigint> = toJson(big);
    // This should compile and result should be a string (though typed as bigint | `${bigint}`)
    const _check: bigint | `${bigint}` = result;
    expect(typeof result).toBe('string');
});

test('type safety: Json<Set<number>> is number[]', () => {
    const set = new Set([1, 2, 3]);
    const result: Json<Set<number>> = toJson(set);
    // This should compile and result should be number[]
    const _check: number[] = result;
    expect(Array.isArray(result)).toBe(true);
});

test('type safety: Json<Map<string, number>> is [string, number][]', () => {
    const map = new Map([
        ['a', 1],
        ['b', 2],
    ]);
    const result: Json<Map<string, number>> = toJson(map);
    // This should compile and result should be [string, number][]
    const _check: [string, number][] = result;
    expect(Array.isArray(result)).toBe(true);
});
