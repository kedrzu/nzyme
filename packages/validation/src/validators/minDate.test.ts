import { expect, test } from 'bun:test';

import { translateToString } from '@nzyme/i18n/translateToString.js';

import type { ValidationContext } from '../Validator.js';
import { minDate } from './minDate.js';
import * as l from './validators.loc.js';

const ctx: ValidationContext = { lang: 'en' };
const bound = new Date('2024-01-15T12:00:00');

test('minDate passes at and after the bound', () => {
    expect(minDate(bound)(new Date('2024-01-15T12:00:00'), ctx)).toBeUndefined();
    expect(minDate(bound)(new Date('2024-02-01'), ctx)).toBeUndefined();
});

test('minDate fails before the bound, including earlier on the same day', () => {
    const message = translateToString(l.minDateNotMet, 'en', { minDate: bound.toLocaleDateString() });

    expect(minDate(bound)(new Date('2024-01-01'), ctx)).toBe(message);
    expect(minDate(bound)(new Date('2024-01-15T06:00:00'), ctx)).toBe(message);
});

test('minDate skips null and non-Date values', () => {
    expect(minDate(bound)(null, ctx)).toBeUndefined();
    expect(minDate(bound)('not a date' as unknown as Date, ctx)).toBeUndefined();
});

test('minDate exclusive requires strictly after', () => {
    const validator = minDate(bound, { exclusive: true });

    expect(validator(new Date('2024-01-15T12:00:00'), ctx)).toBeDefined();
    expect(validator(new Date('2024-01-16'), ctx)).toBeUndefined();
});

test('minDate custom message', () => {
    expect(minDate(bound, { message: () => 'Too early' })(new Date('2024-01-01'), ctx)).toBe('Too early');
});
