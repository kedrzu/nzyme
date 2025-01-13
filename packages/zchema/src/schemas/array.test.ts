import { expect, test } from 'vitest';

import { minValidator, regexValidator } from '@nzyme/validation';

import { array } from './array.js';
import { number } from './number.js';
import { object } from './object.js';
import { string } from './string.js';
import { coerce } from '../utils/coerce.js';
import { validate } from '../utils/validate.js';

test('array of numbers', () => {
    const schema = array({
        of: number(),
    });

    const value = coerce(schema, [1, 2, '3']);

    expect(value).toEqual([1, 2, 3]);
});

test('validate array of strings', () => {
    const schema = array({
        of: string({
            validators: [
                regexValidator({
                    regex: /^[a-z]+$/,
                    message: () => 'Must be lowercase letters',
                }),
            ],
        }),
    });

    const validResult = validate(schema, ['foo', 'bar']);
    expect(validResult).toBe(null);

    const invalidResult = validate(schema, ['foo', 'BAR']);

    expect(invalidResult).toEqual({
        1: ['Must be lowercase letters'],
    });
});

test('validate array of objects', () => {
    const schema = array({
        of: object({
            props: {
                number: number({
                    nullable: true,
                    validators: [minValidator({ minValue: 10 })],
                }),
                string: string({
                    validators: [
                        regexValidator({
                            regex: /^[a-z]+$/,
                            message: () => 'Must be lowercase letters',
                        }),
                    ],
                }),
            },
        }),
        validators: [
            value => {
                if (value.length > 2) {
                    return 'Must have at most 2 elements';
                }
            },
        ],
    });

    const validResult = validate(schema, [
        { number: 42, string: 'foo' },
        { number: null, string: 'bar' },
    ]);
    expect(validResult).toBe(null);

    const invalidResult = validate(schema, [
        { number: 42, string: 'foo' },
        { number: null, string: 'BAR' },
        { number: 5, string: 'bar' },
        { number: 5, string: 'BAR' },
    ]);

    expect(invalidResult).toEqual({
        '1.string': ['Must be lowercase letters'],
        '2.number': ['Minimum value is 10'],
        '3.number': ['Minimum value is 10'],
        '3.string': ['Must be lowercase letters'],
        '': ['Must have at most 2 elements'],
    });
});
