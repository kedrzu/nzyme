import { expect, test } from 'bun:test';

import { translateToString } from '@nzyme/i18n/translateToString.js';

import type { ValidationContext } from '../Validator.js';
import { maxDate } from './maxDate.js';
import * as l from './validators.loc.js';

const ctx: ValidationContext = { lang: 'en' };
const bound = new Date('2024-01-15T12:00:00');

test('maxDate passes at and before the bound', () => {
    expect(maxDate(bound)(new Date('2024-01-15T12:00:00'), ctx)).toBeUndefined();
    expect(maxDate(bound)(new Date('2024-01-01'), ctx)).toBeUndefined();
});

test('maxDate fails after the bound, including later on the same day', () => {
    const message = translateToString(l.maxDateExceeded, 'en', { maxDate: bound.toLocaleDateString() });

    expect(maxDate(bound)(new Date('2024-02-01'), ctx)).toBe(message);
    expect(maxDate(bound)(new Date('2024-01-15T18:00:00'), ctx)).toBe(message);
});

test('maxDate skips null and non-Date values', () => {
    expect(maxDate(bound)(null, ctx)).toBeUndefined();
    expect(maxDate(bound)('not a date' as unknown as Date, ctx)).toBeUndefined();
});

test('maxDate exclusive requires strictly before', () => {
    const validator = maxDate(bound, { exclusive: true });

    expect(validator(new Date('2024-01-15T12:00:00'), ctx)).toBeDefined();
    expect(validator(new Date('2024-01-14'), ctx)).toBeUndefined();
});

test('maxDate custom message', () => {
    expect(maxDate(bound, { message: () => 'Too late' })(new Date('2024-02-01'), ctx)).toBe('Too late');
});
