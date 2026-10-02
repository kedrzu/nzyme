import { expect, test } from 'bun:test';

import { translateToString } from '@nzyme/i18n/translateToString.js';

import type { ValidationContext } from '../Validator.js';
import { maxValue } from './maxValue.js';
import * as l from './validators.loc.js';

const ctx: ValidationContext = { lang: 'en' };

test('maxValue passes at and below the bound', () => {
    expect(maxValue(10)(10, ctx)).toBeUndefined();
    expect(maxValue(10)(5, ctx)).toBeUndefined();
});

test('maxValue fails above the bound with the translated message', () => {
    expect(maxValue(10)(15, ctx)).toBe(translateToString(l.maxValueExceeded, 'en', { maxValue: '10' }));
});

test('maxValue skips null', () => {
    expect(maxValue(10)(null, ctx)).toBeUndefined();
});

test('maxValue compares bigints', () => {
    expect(maxValue(100n)(100n, ctx)).toBeUndefined();
    expect(maxValue(100n)(101n, ctx)).toBeDefined();
});

test('maxValue exclusive requires strictly less', () => {
    const validator = maxValue(10, { exclusive: true });

    expect(validator(10, ctx)).toBeDefined();
    expect(validator(9, ctx)).toBeUndefined();
});

test('maxValue custom message', () => {
    expect(maxValue(10, { message: () => 'Value too large' })(15, ctx)).toBe('Value too large');
});
