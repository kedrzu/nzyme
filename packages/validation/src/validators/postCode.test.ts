import { expect, test } from 'bun:test';

import { translateToString } from '@nzyme/i18n/translateToString.js';

import type { ValidationContext } from '../Validator.js';
import { postCode } from './postCode.js';
import * as l from './validators.loc.js';

const ctx: ValidationContext = { lang: 'en' };

test('postCode passes for a code valid in the country', () => {
    expect(postCode('PL')('00-950', ctx)).toBeUndefined();
    expect(postCode('US')('90210', ctx)).toBeUndefined();
});

test('postCode fails for a code invalid in the country', () => {
    expect(postCode('PL')('90210', ctx)).toBe(translateToString(l.invalidPostCode, 'en'));
});

test('postCode skips empty values and an unknown country', () => {
    expect(postCode('PL')('', ctx)).toBeUndefined();
    expect(postCode('PL')(null, ctx)).toBeUndefined();
    expect(postCode(null)('90210', ctx)).toBeUndefined();
    expect(postCode('')('90210', ctx)).toBeUndefined();
});

test('postCode custom message', () => {
    expect(postCode('PL', { message: () => 'Bad code' })('90210', ctx)).toBe('Bad code');
});
