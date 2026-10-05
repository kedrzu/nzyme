import { expect, test } from 'bun:test';

import { translateToString } from '@nzyme/i18n/translateToString.js';

import type { ValidationContext } from '../Validator.js';
import { phoneNumber } from './phoneNumber.js';
import * as l from './validators.loc.js';

const ctx: ValidationContext = { lang: 'en' };

test.each(['+48 600 700 800', '+12025550123'])('phoneNumber passes for %p', value => {
    expect(phoneNumber()(value, ctx)).toBeUndefined();
});

test.each(['600700800', '+48 123', 'not a phone'])('phoneNumber fails for %p', value => {
    expect(phoneNumber()(value, ctx)).toBe(translateToString(l.invalidPhoneNumber, 'en'));
});

test.each([null, undefined, '', '   '])('phoneNumber skips empty value %p', value => {
    expect(phoneNumber()(value, ctx)).toBeUndefined();
});

test('phoneNumber custom message', () => {
    expect(phoneNumber({ message: () => 'Bad phone' })('123', ctx)).toBe('Bad phone');
});
