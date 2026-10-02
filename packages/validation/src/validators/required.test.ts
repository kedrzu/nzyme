import { expect, test } from 'bun:test';

import { translateToString } from '@nzyme/i18n/translateToString.js';

import type { ValidationContext } from '../Validator.js';
import { required } from './required.js';
import * as l from './validators.loc.js';

const ctx: ValidationContext = { lang: 'en' };

// Rows are wrapped because test.each spreads array rows into arguments.
test.each([[null], [undefined], [false], [''], ['   '], [[]]])('required fails for %p', value => {
    expect(required()(value, ctx)).toBe(translateToString(l.required, 'en'));
});

test.each([['hello'], [true], [0], [42], [[1]], [{}]])('required passes for %p', value => {
    expect(required()(value, ctx)).toBeUndefined();
});

test('required uses the context language and falls back to English', () => {
    expect(required()(null, { lang: 'pl' })).toBe(translateToString(l.required, 'pl'));
    expect(required()(null, {})).toBe(translateToString(l.required, 'en'));
});

test('required custom test replaces the emptiness check', () => {
    const validator = required({ test: value => value === 'specific' });

    expect(validator('other', ctx)).toBe(translateToString(l.required, 'en'));
    expect(validator('specific', ctx)).toBeUndefined();
});

test('required custom message receives the value', () => {
    const validator = required<string>({ message: value => `Missing: ${String(value)}` });

    expect(validator('', ctx)).toBe('Missing: ');
});
