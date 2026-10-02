import { expect, test } from 'bun:test';

import { translateToString } from '@nzyme/i18n/translateToString.js';

import type { ValidationContext } from '../Validator.js';
import { minValue } from './minValue.js';
import * as l from './validators.loc.js';

const ctx: ValidationContext = { lang: 'en' };

test('minValue passes at and above the bound', () => {
    expect(minValue(10)(10, ctx)).toBeUndefined();
    expect(minValue(10)(15, ctx)).toBeUndefined();
    expect(minValue(-10)(-5, ctx)).toBeUndefined();
});

test('minValue fails below the bound with the translated message', () => {
    expect(minValue(10)(5, ctx)).toBe(translateToString(l.minValueNotMet, 'en', { minValue: '10' }));
    expect(minValue(0)(-1, ctx)).toBeDefined();
});

test('minValue skips null', () => {
    expect(minValue(10)(null, ctx)).toBeUndefined();
});

test('minValue compares bigints', () => {
    expect(minValue(100n)(100n, ctx)).toBeUndefined();
    expect(minValue(100n)(99n, ctx)).toBe(translateToString(l.minValueNotMet, 'en', { minValue: '100' }));
});

test('minValue exclusive requires strictly greater', () => {
    const validator = minValue(10, { exclusive: true });

    expect(validator(10, ctx)).toBeDefined();
    expect(validator(11, ctx)).toBeUndefined();
});

test('minValue custom message', () => {
    expect(minValue(10, { message: () => 'Value too small' })(5, ctx)).toBe('Value too small');
});
