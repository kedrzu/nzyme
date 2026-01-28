import { expect, test } from 'vitest';
import { ref } from 'vue';

import type { FormValidationContext } from '../types.js';
import { minValueValidator } from './minValueValidator.js';

const mockCtx: FormValidationContext = {
    lang: 'en',
};

test('minValueValidator passes when value equals minimum', () => {
    const validator = minValueValidator({ minValue: 10 });
    expect(validator.validate(10, mockCtx)).toBeFalsy();
});

test('minValueValidator passes when value exceeds minimum', () => {
    const validator = minValueValidator({ minValue: 10 });
    expect(validator.validate(15, mockCtx)).toBeFalsy();
});

test('minValueValidator returns error when value below minimum', () => {
    const validator = minValueValidator({ minValue: 10 });
    expect(validator.validate(5, mockCtx)).toBeTruthy();
});

test('minValueValidator passes for null value', () => {
    const validator = minValueValidator({ minValue: 10 });
    expect(validator.validate(null, mockCtx)).toBeFalsy();
});

test('minValueValidator works with bigint', () => {
    const validator = minValueValidator({ minValue: 100n });
    expect(validator.validate(100n, mockCtx)).toBeFalsy();
    expect(validator.validate(99n, mockCtx)).toBeTruthy();
});

test('minValueValidator exclusive mode requires strictly greater than', () => {
    const validator = minValueValidator({ minValue: 10, exclusive: true });
    expect(validator.validate(10, mockCtx)).toBeTruthy(); // 10 not > 10
    expect(validator.validate(11, mockCtx)).toBeFalsy(); // 11 > 10
});

test('minValueValidator ref minValue updates dynamically', () => {
    const minValue = ref(10);
    const validator = minValueValidator({ minValue });

    expect(validator.validate(5, mockCtx)).toBeTruthy();

    minValue.value = 3;
    expect(validator.validate(5, mockCtx)).toBeFalsy();
});

test('minValueValidator works with zero', () => {
    const validator = minValueValidator({ minValue: 0 });
    expect(validator.validate(0, mockCtx)).toBeFalsy();
    expect(validator.validate(-1, mockCtx)).toBeTruthy();
});

test('minValueValidator works with negative numbers', () => {
    const validator = minValueValidator({ minValue: -10 });
    expect(validator.validate(-5, mockCtx)).toBeFalsy();
    expect(validator.validate(-15, mockCtx)).toBeTruthy();
});

test('minValueValidator custom error message', () => {
    const validator = minValueValidator({
        minValue: 10,
        message: () => 'Value too small',
    });

    const result = validator.validate(5, mockCtx);
    expect(result).toBe('Value too small');
});

test('minValueValidator passes any reasonable number with MIN_SAFE_INTEGER', () => {
    const validator = minValueValidator({ minValue: Number.MIN_SAFE_INTEGER });
    expect(validator.validate(0, mockCtx)).toBeFalsy();
});

test('minValueValidator has async: false or undefined', () => {
    expect(minValueValidator({ minValue: 5 }).async).toBeFalsy();
});
