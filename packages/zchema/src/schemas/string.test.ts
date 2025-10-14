import { describe, expect, test } from 'vitest';
import { string } from './string.js';

describe('string schema', () => {
    test('basic string schema creation', () => {
        const schema = string();
        expect(schema).toBeDefined();
        expect(schema.type).toBe(string);
        expect(schema.nullable).toBe(false);
        expect(schema.optional).toBe(false);
    });

    test('string schema with options', () => {
        const schema = string({ nullable: true, optional: true });
        expect(schema.nullable).toBe(true);
        expect(schema.optional).toBe(true);
    });

    test('string schema check method', () => {
        const schema = string();
        expect(schema.proto.check('test')).toBe(true);
        expect(schema.proto.check('')).toBe(true);
        expect(schema.proto.check(123)).toBe(false);
        expect(schema.proto.check(null)).toBe(false);
        expect(schema.proto.check(undefined)).toBe(false);
    });

    test('string schema coerce method', () => {
        const schema = string();
        expect(schema.proto.coerce('test')).toBe('test');
        expect(schema.proto.coerce(123)).toBe('123');
        expect(schema.proto.coerce(true)).toBe('true');
        expect(schema.proto.coerce(null)).toBe('null');
    });

    test('string schema default method', () => {
        const schema = string();
        expect(schema.proto.default()).toBe('');

        const customDefault = string({ default: () => 'custom' });
        expect(customDefault.default?.()).toBe('custom');

        const staticDefault = string({ default: 'static' });
        expect(staticDefault.default?.()).toBe('static');
    });
});
