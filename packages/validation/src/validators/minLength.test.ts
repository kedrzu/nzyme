import { expect, test } from 'bun:test';

import { translateToString } from '@nzyme/i18n/translateToString.js';

import type { ValidationContext } from '../Validator.js';
import { minLength } from './minLength.js';
import * as l from './validators.loc.js';

const ctx: ValidationContext = { lang: 'en' };

test('minLength passes at and above the limit', () => {
    expect(minLength(5)('hello', ctx)).toBeUndefined();
    expect(minLength(3)('hello', ctx)).toBeUndefined();
});

test('minLength fails below the limit with the translated message', () => {
    expect(minLength(10)('hello', ctx)).toBe(translateToString(l.minLengthNotMet, 'en', { minLength: '10' }));
});

test('minLength skips null and undefined but measures an empty string', () => {
    expect(minLength(5)(null, ctx)).toBeUndefined();
    expect(minLength(5)(undefined, ctx)).toBeUndefined();
    expect(minLength(1)('', ctx)).toBe(translateToString(l.minLengthNotMet, 'en', { minLength: '1' }));
    expect(minLength(0)('', ctx)).toBeUndefined();
});

test('minLength measures arrays', () => {
    expect(minLength(3)([1, 2, 3], ctx)).toBeUndefined();
    expect(minLength(3)([1, 2], ctx)).toBeDefined();
});

test('minLength exclusive requires strictly more', () => {
    const validator = minLength(5, { exclusive: true });

    expect(validator('hello', ctx)).toBeDefined();
    expect(validator('hello!', ctx)).toBeUndefined();
});

test('minLength custom message', () => {
    expect(minLength(5, { message: () => 'Too short' })('hi', ctx)).toBe('Too short');
});
