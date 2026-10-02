import { expect, test } from 'bun:test';

import { translateToString } from '@nzyme/i18n/translateToString.js';

import type { ValidationContext } from '../Validator.js';
import { maxLength } from './maxLength.js';
import * as l from './validators.loc.js';

const ctx: ValidationContext = { lang: 'en' };

test('maxLength passes at and below the limit', () => {
    expect(maxLength(5)('hello', ctx)).toBeUndefined();
    expect(maxLength(10)('hello', ctx)).toBeUndefined();
    expect(maxLength(0)('', ctx)).toBeUndefined();
});

test('maxLength fails above the limit with the translated message', () => {
    expect(maxLength(3)('hello', { lang: 'pl' })).toBe(
        translateToString(l.maxLengthExceeded, 'pl', { maxLength: '3' }),
    );
});

test('maxLength skips null', () => {
    expect(maxLength(5)(null, ctx)).toBeUndefined();
});

test('maxLength measures arrays', () => {
    expect(maxLength(3)([1, 2, 3], ctx)).toBeUndefined();
    expect(maxLength(3)([1, 2, 3, 4], ctx)).toBeDefined();
});

test('maxLength exclusive requires strictly less', () => {
    const validator = maxLength(5, { exclusive: true });

    expect(validator('hello', ctx)).toBeDefined();
    expect(validator('hell', ctx)).toBeUndefined();
});

test('maxLength custom message', () => {
    expect(maxLength(3, { message: () => 'Too long' })('hello', ctx)).toBe('Too long');
});
