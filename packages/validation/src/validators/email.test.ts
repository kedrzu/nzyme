import { expect, test } from 'bun:test';

import { translateToString } from '@nzyme/i18n/translateToString.js';

import type { ValidationContext } from '../Validator.js';
import { email } from './email.js';
import * as l from './validators.loc.js';

const ctx: ValidationContext = { lang: 'en' };

test.each(['test@example.com', 'user@mail.example.com', 'user+tag@example.com', '"quoted name"@example.com'])(
    'email passes for %p',
    value => {
        expect(email()(value, ctx)).toBeUndefined();
    },
);

test.each(['invalid', 'user@', 'userexample.com', 'user@example.c', 'a.@example.com'])('email fails for %p', value => {
    expect(email()(value, ctx)).toBe(translateToString(l.invalidEmail, 'en'));
});

test.each([null, undefined, '', '   '])('email skips empty value %p', value => {
    expect(email()(value, ctx)).toBeUndefined();
});

test('email custom message', () => {
    expect(email({ message: () => 'Please enter a valid email' })('invalid', ctx)).toBe('Please enter a valid email');
});
