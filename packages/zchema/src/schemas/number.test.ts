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

describe('number schema', () => {
    test('basic number schema creation', () => {
        const schema = number();
        expect(schema).toBeDefined();
        expect(schema.type).toBe(number);
        expect(schema.nullable).toBe(false);
        expect(schema.optional).toBe(false);
    });

    test('number schema with options', () => {
        const schema = number({ nullable: true, optional: true });
        expect(schema.nullable).toBe(true);
        expect(schema.optional).toBe(true);
    });

    test('number schema check method', () => {
        const schema = number();
        expect(schema.proto.check(123)).toBe(true);
        expect(schema.proto.check(0)).toBe(true);
        expect(schema.proto.check(-1.5)).toBe(true);
        expect(schema.proto.check(NaN)).toBe(true); // NaN is a number type in JS
        expect(schema.proto.check('test')).toBe(false);
        expect(schema.proto.check(null)).toBe(false);
        expect(schema.proto.check(undefined)).toBe(false);
    });

    test('number schema coerce method', () => {
        const schema = number();
        expect(schema.proto.coerce(123)).toBe(123);
        expect(schema.proto.coerce('456')).toBe(456);
        expect(schema.proto.coerce('3.14')).toBe(3.14);
        expect(schema.proto.coerce(true)).toBe(1);
        expect(schema.proto.coerce(false)).toBe(0);
        expect(schema.proto.coerce('')).toBe(0);
        expect(schema.proto.coerce('abc')).toBeNaN();
    });

    test('number schema default method', () => {
        const schema = number();
        expect(schema.proto.default()).toBe(0);

        const customDefault = number({ default: () => 42 });
        expect(customDefault.default?.()).toBe(42);

        const staticDefault = number({ default: 99.9 });
        expect(staticDefault.default?.()).toBe(99.9);
    });
});
