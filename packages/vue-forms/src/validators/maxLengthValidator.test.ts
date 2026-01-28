import { expect, test } from 'vitest';
import { ref } from 'vue';

import type { FormValidationContext } from '../types.js';
import { maxLengthValidator } from './maxLengthValidator.js';

const mockCtx: FormValidationContext = {
    lang: 'en',
};

test('maxLengthValidator passes when length at maximum', () => {
    const validator = maxLengthValidator({ maxLength: 5 });
    expect(validator.validate('hello', mockCtx)).toBeFalsy();
});

test('maxLengthValidator passes when length below maximum', () => {
    const validator = maxLengthValidator({ maxLength: 10 });
    expect(validator.validate('hello', mockCtx)).toBeFalsy();
});

test('maxLengthValidator returns error when length exceeds maximum', () => {
    const validator = maxLengthValidator({ maxLength: 3 });
    expect(validator.validate('hello', mockCtx)).toBeTruthy();
});

test('maxLengthValidator passes for null value', () => {
    const validator = maxLengthValidator({ maxLength: 5 });
    expect(validator.validate(null, mockCtx)).toBeFalsy();
});

test('maxLengthValidator works with array length', () => {
    const validator = maxLengthValidator({ maxLength: 3 });
    expect(validator.validate([1, 2, 3], mockCtx)).toBeFalsy();
    expect(validator.validate([1, 2, 3, 4], mockCtx)).toBeTruthy();
});

test('maxLengthValidator exclusive mode requires strictly less than', () => {
    const validator = maxLengthValidator({ maxLength: 5, exclusive: true });
    expect(validator.validate('hello', mockCtx)).toBeTruthy(); // length 5 not < 5
    expect(validator.validate('hell', mockCtx)).toBeFalsy(); // length 4 < 5
});

test('maxLengthValidator ref maxLength updates dynamically', () => {
    const maxLength = ref(3);
    const validator = maxLengthValidator({ maxLength });

    expect(validator.validate('hello', mockCtx)).toBeTruthy();

    maxLength.value = 10;
    expect(validator.validate('hello', mockCtx)).toBeFalsy();
});

test('maxLengthValidator custom error message', () => {
    const validator = maxLengthValidator({
        maxLength: 3,
        message: () => 'Too long',
    });

    const result = validator.validate('hello', mockCtx);
    expect(result).toBe('Too long');
});

test('maxLengthValidator passes for empty string with maxLength 0', () => {
    const validator = maxLengthValidator({ maxLength: 0 });
    expect(validator.validate('', mockCtx)).toBeFalsy();
});

test('maxLengthValidator works with objects having length property', () => {
    const validator = maxLengthValidator({ maxLength: 5 });
    const objWithLength = { length: 4, other: 'property' };
    expect(validator.validate(objWithLength as unknown as string, mockCtx)).toBeFalsy();
});

test('maxLengthValidator has async: false or undefined', () => {
    expect(maxLengthValidator({ maxLength: 5 }).async).toBeFalsy();
});
