import { expect, test } from 'bun:test';

import type { FormValidationContext } from '../types.js';
import { emailValidator } from './emailValidator.js';

const mockCtx: FormValidationContext = {
    lang: 'en',
};

test('emailValidator passes for valid email', () => {
    const validator = emailValidator();
    expect(validator.validate('test@example.com', mockCtx)).toBeFalsy();
});

test('emailValidator passes for email with subdomain', () => {
    const validator = emailValidator();
    expect(validator.validate('user@mail.example.com', mockCtx)).toBeFalsy();
});

test('emailValidator passes for email with plus sign', () => {
    const validator = emailValidator();
    expect(validator.validate('user+tag@example.com', mockCtx)).toBeFalsy();
});

test('emailValidator returns error for invalid email', () => {
    const validator = emailValidator();
    expect(validator.validate('invalid', mockCtx)).toBeTruthy();
});

test('emailValidator returns error for email without domain', () => {
    const validator = emailValidator();
    expect(validator.validate('user@', mockCtx)).toBeTruthy();
});

test('emailValidator returns error for email without @', () => {
    const validator = emailValidator();
    expect(validator.validate('userexample.com', mockCtx)).toBeTruthy();
});

test('emailValidator passes for empty string (not required)', () => {
    const validator = emailValidator();
    expect(validator.validate('', mockCtx)).toBeFalsy();
});

test('emailValidator passes for null (not required)', () => {
    const validator = emailValidator();
    expect(validator.validate(null, mockCtx)).toBeFalsy();
});

test('emailValidator passes for whitespace-only (trimmed to empty)', () => {
    const validator = emailValidator();
    expect(validator.validate('   ', mockCtx)).toBeFalsy();
});

test('emailValidator custom error message', () => {
    const validator = emailValidator({
        message: () => 'Please enter a valid email',
    });

    const result = validator.validate('invalid', mockCtx);
    expect(result).toBe('Please enter a valid email');
});

test('emailValidator returns error for too short TLD', () => {
    const validator = emailValidator();
    expect(validator.validate('a@b.c', mockCtx)).toBeTruthy();
});

test('emailValidator returns error for missing local part', () => {
    const validator = emailValidator();
    expect(validator.validate('@domain.com', mockCtx)).toBeTruthy();
});

test('emailValidator has async: false or undefined', () => {
    expect(emailValidator().async).toBeFalsy();
});
