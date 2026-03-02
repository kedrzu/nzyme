import { expect, test } from 'bun:test';
import { ref } from 'vue';

import type { FormValidationContext } from '../types.js';
import { regexValidator } from './regexValidator.js';

const mockCtx: FormValidationContext = {
    lang: 'en',
};

test('regexValidator passes when value matches regex', () => {
    const validator = regexValidator({ regex: /^[A-Z]+$/ });
    expect(validator.validate('HELLO', mockCtx)).toBeFalsy();
});

test('regexValidator returns error when value does not match regex', () => {
    const validator = regexValidator({ regex: /^[A-Z]+$/ });
    expect(validator.validate('hello', mockCtx)).toBeTruthy();
});

test('regexValidator passes for empty string (not required)', () => {
    const validator = regexValidator({ regex: /^[A-Z]+$/ });
    expect(validator.validate('', mockCtx)).toBeFalsy();
});

test('regexValidator passes for null (not required)', () => {
    const validator = regexValidator({ regex: /^[A-Z]+$/ });
    expect(validator.validate(null, mockCtx)).toBeFalsy();
});

test('regexValidator works with complex patterns', () => {
    // Phone number pattern
    const validator = regexValidator({ regex: /^\+?[0-9]{10,14}$/ });
    expect(validator.validate('+12345678901', mockCtx)).toBeFalsy();
    expect(validator.validate('abc', mockCtx)).toBeTruthy();
});

test('regexValidator ref regex updates dynamically', () => {
    const regex = ref(/^[A-Z]+$/);
    const validator = regexValidator({ regex });

    expect(validator.validate('hello', mockCtx)).toBeTruthy();

    regex.value = /^[a-z]+$/;
    expect(validator.validate('hello', mockCtx)).toBeFalsy();
});

test('regexValidator getter regex works with reactive source', () => {
    const pattern = ref(/^[A-Z]+$/);
    const validator = regexValidator({ regex: () => pattern.value });

    expect(validator.validate('hello', mockCtx)).toBeTruthy();

    pattern.value = /^[a-z]+$/;
    expect(validator.validate('hello', mockCtx)).toBeFalsy();
});

test('regexValidator custom error message', () => {
    const validator = regexValidator({
        regex: /^[A-Z]+$/,
        message: () => 'Must be uppercase',
    });

    const result = validator.validate('hello', mockCtx);
    expect(result).toBe('Must be uppercase');
});

test('regexValidator has async: false or undefined', () => {
    expect(regexValidator({ regex: /test/ }).async).toBeFalsy();
});
