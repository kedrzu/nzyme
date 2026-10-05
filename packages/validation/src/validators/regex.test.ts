import { expect, test } from 'bun:test';

import { translateToString } from '@nzyme/i18n/translateToString.js';

import type { ValidationContext } from '../Validator.js';
import { regex } from './regex.js';
import * as l from './validators.loc.js';

const ctx: ValidationContext = { lang: 'en' };

test('regex passes when the value matches', () => {
    expect(regex(/^[A-Z]+$/)('HELLO', ctx)).toBeUndefined();
    expect(regex(/^\+?[0-9]{10,14}$/)('+12345678901', ctx)).toBeUndefined();
});

test('regex fails when the value does not match', () => {
    expect(regex(/^[A-Z]+$/)('hello', ctx)).toBe(translateToString(l.invalidFormat, 'en'));
});

test.each([null, undefined, ''])('regex skips empty value %p', value => {
    expect(regex(/^[A-Z]+$/)(value, ctx)).toBeUndefined();
});

test('regex custom message', () => {
    expect(regex(/^[A-Z]+$/, { message: () => 'Must be uppercase' })('hello', ctx)).toBe('Must be uppercase');
});
