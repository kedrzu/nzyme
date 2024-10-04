import { expect, test } from 'vitest';

import { minValidator, regexValidator } from '@nzyme/validate';

import { array } from './array.js';
import { number } from './number.js';
import { object } from './object.js';
import { string } from './string.js';
import { coerce } from '../utils/coerce.js';
import { validate } from '../utils/validate.js';

test('basic object schema', () => {
    const schema = object({
        props: {
            number: number({}),
            numberNullable: number({ nullable: true }),
            numberOptional: number({ optional: true }),
            string: string(),
            stringNullable: string({ nullable: true }),
            stringOptional: string({ optional: true }),
            array: array({
                of: string(),
            }),
        },
    });

    const value = coerce(schema, {});

    expect(value).toEqual({
        number: 0,
        numberNullable: null,
        numberOptional: undefined,
        string: '',
        stringNullable: null,
        stringOptional: undefined,
        array: [],
    });
});

test('validate object schema', () => {
    const schema = object({
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
    });

    const validResult = validate(schema, {
        number: 42,
        string: 'foo',
    });

    expect(validResult).toBe(null);

    const invalidResult = validate(schema, {
        number: 5,
        string: 'FOO',
    });

    expect(invalidResult).toEqual({
        number: ['Minimalna wartość to 10'],
        string: ['Must be lowercase letters'],
    });
});
