import { expect, test } from 'bun:test';
import { ref } from 'vue';

import type { FormValidationContext } from '../types.js';
import { minLengthValidator } from './minLengthValidator.js';

const mockCtx: FormValidationContext = {
    lang: 'en',
};

test('minLengthValidator passes when length meets minimum', () => {
    const validator = minLengthValidator({ minLength: 5 });
    expect(validator.validate('hello', mockCtx)).toBeFalsy();
});

test('minLengthValidator passes when length exceeds minimum', () => {
    const validator = minLengthValidator({ minLength: 3 });
    expect(validator.validate('hello', mockCtx)).toBeFalsy();
});

test('minLengthValidator returns error when length below minimum', () => {
    const validator = minLengthValidator({ minLength: 10 });
    expect(validator.validate('hello', mockCtx)).toBeTruthy();
});

test('minLengthValidator passes for null value', () => {
    const validator = minLengthValidator({ minLength: 5 });
    expect(validator.validate(null, mockCtx)).toBeFalsy();
});

test('minLengthValidator passes for undefined value', () => {
    const validator = minLengthValidator({ minLength: 5 });
    expect(validator.validate(undefined, mockCtx)).toBeFalsy();
});

test('minLengthValidator works with array length', () => {
    const validator = minLengthValidator({ minLength: 3 });
    expect(validator.validate([1, 2, 3], mockCtx)).toBeFalsy();
    expect(validator.validate([1, 2], mockCtx)).toBeTruthy();
});

test('minLengthValidator exclusive mode requires strictly greater than', () => {
    const validator = minLengthValidator({ minLength: 5, exclusive: true });
    expect(validator.validate('hello', mockCtx)).toBeTruthy(); // length 5 not > 5
    expect(validator.validate('hello!', mockCtx)).toBeFalsy(); // length 6 > 5
});

test('minLengthValidator ref minLength updates dynamically', () => {
    const minLength = ref(3);
    const validator = minLengthValidator({ minLength });

    expect(validator.validate('hi', mockCtx)).toBeTruthy();

    minLength.value = 2;
    expect(validator.validate('hi', mockCtx)).toBeFalsy();
});

test('minLengthValidator getter minLength works with reactive source', () => {
    const min = ref(3);
    const validator = minLengthValidator({ minLength: () => min.value });

    expect(validator.validate('hi', mockCtx)).toBeTruthy();

    min.value = 2;
    expect(validator.validate('hi', mockCtx)).toBeFalsy();
});

test('minLengthValidator custom error message', () => {
    const validator = minLengthValidator({
        minLength: 5,
        message: () => 'Too short',
    });

    const result = validator.validate('hi', mockCtx);
    expect(result).toBe('Too short');
});

test('minLengthValidator passes for empty string with minLength 0', () => {
    const validator = minLengthValidator({ minLength: 0 });
    expect(validator.validate('', mockCtx)).toBeFalsy();
});

test('minLengthValidator works with objects having length property', () => {
    const validator = minLengthValidator({ minLength: 3 });
    const objWithLength = { length: 4, other: 'property' };
    expect(validator.validate(objWithLength as unknown as string, mockCtx)).toBeFalsy();
});

test('minLengthValidator has async: false or undefined', () => {
    expect(minLengthValidator({ minLength: 5 }).async).toBeFalsy();
});
