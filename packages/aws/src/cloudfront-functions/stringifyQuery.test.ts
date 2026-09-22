import { expect, test } from 'bun:test';

import { stringifyQuery } from './stringifyQuery.js';

test('returns nothing for an empty query', () => {
    expect(stringifyQuery({})).toBe('');
});

test('prefixes a question mark once there is something to carry', () => {
    expect(stringifyQuery({ a: { value: '1' } })).toBe('?a=1');
});

test('joins parameters with an ampersand', () => {
    expect(stringifyQuery({ a: { value: '1' }, b: { value: '2' } })).toBe('?a=1&b=2');
});

test('keeps a parameter with an empty value', () => {
    expect(stringifyQuery({ a: { value: '' } })).toBe('?a=');
});

test('leaves an encoded value exactly as CloudFront handed it over', () => {
    // Re-encoding here is what turned `b c` into `b%20c` for the viewer and `b%2520c` at the target.
    expect(stringifyQuery({ a: { value: 'b%20c' } })).toBe('?a=b%20c');
    expect(stringifyQuery({ redirect: { value: 'https%3A%2F%2Fx.com%2Fp%3Fz%3D1' } })).toBe(
        '?redirect=https%3A%2F%2Fx.com%2Fp%3Fz%3D1',
    );
});

test('leaves a plus alone rather than encoding it into %2B', () => {
    expect(stringifyQuery({ a: { value: 'b+c' } })).toBe('?a=b+c');
});

test('carries every value of a repeated parameter', () => {
    const query = {
        dup: {
            value: '1',
            multiValue: [{ value: '1' }, { value: '2' }],
        },
        other: { value: '3' },
    };

    expect(stringifyQuery(query)).toBe('?dup=1&dup=2&other=3');
});

test('does not emit the first value twice, which `value` and `multiValue` both carry', () => {
    const query = {
        a: {
            value: 'first',
            multiValue: [{ value: 'first' }, { value: 'second' }],
        },
    };

    expect(stringifyQuery(query)).toBe('?a=first&a=second');
});
