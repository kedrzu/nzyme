import { expect, test } from 'bun:test';

import { getSingleValue } from './getSingleValue.js';

test('returns undefined for a name that is not there', () => {
    expect(getSingleValue({ a: { value: '1' } }, 'b')).toBeUndefined();
});

test('returns the value of a name carried once', () => {
    expect(getSingleValue({ a: { value: '1' } }, 'a')?.value).toBe('1');
});

test('returns the first value of a repeated name', () => {
    const headers = {
        accept: {
            value: 'application/json',
            multiValue: [{ value: 'application/json' }, { value: 'text/html' }],
        },
    };

    expect(getSingleValue(headers, 'accept')?.value).toBe('application/json');
});
