import { describe, expect, test } from 'vitest';

import { coerce } from '../utils/coerce.js';
import { serialize } from '../utils/serialize.js';
import { number } from './number.js';

describe('non-nullable number schema', () => {
    const schema = number();

    test('coerce number', () => {
        const value = coerce(schema, 42);
        expect(value).toBe(42);
    });

    test('coerce valid string', () => {
        const value = coerce(schema, '42');
        expect(value).toBe(42);
    });

    test('coerce invalid string', () => {
        const value = coerce(schema, 'foo');
        expect(value).toBe(NaN);
    });

    test('coerce null', () => {
        const value = coerce(schema, null);
        expect(value).toBe(0);
    });

    test('coerce undefined', () => {
        const value = coerce(schema, undefined);
        expect(value).toBe(0);
    });

    test('coerce true', () => {
        const value = coerce(schema, true);
        expect(value).toBe(1);
    });

    test('coerce false', () => {
        const value = coerce(schema, false);
        expect(value).toBe(0);
    });

    test('serialize number', () => {
        const value = serialize(schema, 42);
        expect(value).toBe(42);
    });
});

describe('non-nullable number schema with default', () => {
    const schema = number({
        default: () => 42,
    });

    test('coerce number', () => {
        const value = coerce(schema, 42);
        expect(value).toBe(42);
    });

    test('coerce valid string', () => {
        const value = coerce(schema, '42');
        expect(value).toBe(42);
    });

    test('coerce invalid string', () => {
        const value = coerce(schema, 'foo');
        expect(value).toBe(NaN);
    });

    test('coerce null', () => {
        const value = coerce(schema, null);
        expect(value).toBe(42);
    });

    test('coerce undefined', () => {
        const value = coerce(schema, undefined);
        expect(value).toBe(42);
    });

    test('coerce true', () => {
        const value = coerce(schema, true);
        expect(value).toBe(1);
    });

    test('coerce false', () => {
        const value = coerce(schema, false);
        expect(value).toBe(0);
    });

    test('serialize number', () => {
        const value = serialize(schema, 42);
        expect(value).toBe(42);
    });
});

describe('nullable number schema', () => {
    const schema = number({ nullable: true });

    test('coerce number', () => {
        const value = coerce(schema, 42);
        expect(value).toBe(42);
    });

    test('coerce valid string', () => {
        const value = coerce(schema, '42');
        expect(value).toBe(42);
    });

    test('coerce invalid string', () => {
        const value = coerce(schema, 'foo');
        expect(value).toBe(NaN);
    });

    test('coerce null', () => {
        const value = coerce(schema, null);
        expect(value).toBe(null);
    });

    test('coerce undefined', () => {
        const value = coerce(schema, undefined);
        expect(value).toBe(null);
    });

    test('coerce true', () => {
        const value = coerce(schema, true);
        expect(value).toBe(1);
    });

    test('coerce false', () => {
        const value = coerce(schema, false);
        expect(value).toBe(0);
    });

    test('serialize number', () => {
        const value = serialize(schema, 42);
        expect(value).toBe(42);
    });

    test('serialize null', () => {
        const value = serialize(schema, null);
        expect(value).toBe(null);
    });
});

describe('nullable number schema with default', () => {
    const schema = number({
        nullable: true,
        default: () => 42,
    });

    test('coerce number', () => {
        const value = coerce(schema, 42);
        expect(value).toBe(42);
    });

    test('coerce valid string', () => {
        const value = coerce(schema, '42');
        expect(value).toBe(42);
    });

    test('coerce invalid string', () => {
        const value = coerce(schema, 'foo');
        expect(value).toBe(NaN);
    });

    test('coerce null', () => {
        const value = coerce(schema, null);
        expect(value).toBe(null);
    });

    test('coerce undefined', () => {
        const value = coerce(schema, undefined);
        expect(value).toBe(42);
    });

    test('coerce true', () => {
        const value = coerce(schema, true);
        expect(value).toBe(1);
    });

    test('coerce false', () => {
        const value = coerce(schema, false);
        expect(value).toBe(0);
    });

    test('serialize number', () => {
        const value = serialize(schema, 42);
        expect(value).toBe(42);
    });

    test('serialize null', () => {
        const value = serialize(schema, null);
        expect(value).toBe(null);
    });
});

describe('optional number schema', () => {
    const schema = number({ optional: true });

    test('coerce number', () => {
        const value = coerce(schema, 42);
        expect(value).toBe(42);
    });

    test('coerce valid string', () => {
        const value = coerce(schema, '42');
        expect(value).toBe(42);
    });

    test('coerce invalid string', () => {
        const value = coerce(schema, 'foo');
        expect(value).toBe(NaN);
    });

    test('coerce null', () => {
        const value = coerce(schema, null);
        expect(value).toBe(undefined);
    });

    test('coerce undefined', () => {
        const value = coerce(schema, undefined);
        expect(value).toBe(undefined);
    });

    test('coerce true', () => {
        const value = coerce(schema, true);
        expect(value).toBe(1);
    });

    test('coerce false', () => {
        const value = coerce(schema, false);
        expect(value).toBe(0);
    });

    test('serialize number', () => {
        const value = serialize(schema, 42);
        expect(value).toBe(42);
    });

    test('serialize undefined', () => {
        const value = serialize(schema, undefined);
        expect(value).toBe(undefined);
    });
});
