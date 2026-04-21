import { expect, test } from 'bun:test';
import { ref } from 'vue';

import type { FormValidationContext } from '../types.js';
import { maxValueValidator } from './maxValueValidator.js';

const mockCtx: FormValidationContext = {
    lang: 'en',
};

test('maxValueValidator passes when value equals maximum', () => {
    const validator = maxValueValidator({ maxValue: 10 });
    expect(validator.validate(10, mockCtx)).toBeFalsy();
});

test('maxValueValidator passes when value below maximum', () => {
    const validator = maxValueValidator({ maxValue: 10 });
    expect(validator.validate(5, mockCtx)).toBeFalsy();
});

test('maxValueValidator returns error when value exceeds maximum', () => {
    const validator = maxValueValidator({ maxValue: 10 });
    expect(validator.validate(15, mockCtx)).toBeTruthy();
});

test('maxValueValidator passes for null value', () => {
    const validator = maxValueValidator({ maxValue: 10 });
    expect(validator.validate(null, mockCtx)).toBeFalsy();
});

test('maxValueValidator works with bigint', () => {
    const validator = maxValueValidator({ maxValue: 100n });
    expect(validator.validate(100n, mockCtx)).toBeFalsy();
    expect(validator.validate(101n, mockCtx)).toBeTruthy();
});

test('maxValueValidator exclusive mode requires strictly less than', () => {
    const validator = maxValueValidator({ maxValue: 10, exclusive: true });
    expect(validator.validate(10, mockCtx)).toBeTruthy(); // 10 not < 10
    expect(validator.validate(9, mockCtx)).toBeFalsy(); // 9 < 10
});

test('maxValueValidator ref maxValue updates dynamically', () => {
    const maxValue = ref(10);
    const validator = maxValueValidator({ maxValue });

    expect(validator.validate(15, mockCtx)).toBeTruthy();

    maxValue.value = 20;
    expect(validator.validate(15, mockCtx)).toBeFalsy();
});

test('maxValueValidator works with zero', () => {
    const validator = maxValueValidator({ maxValue: 0 });
    expect(validator.validate(0, mockCtx)).toBeFalsy();
    expect(validator.validate(1, mockCtx)).toBeTruthy();
});

test('maxValueValidator works with negative numbers', () => {
    const validator = maxValueValidator({ maxValue: -5 });
    expect(validator.validate(-10, mockCtx)).toBeFalsy();
    expect(validator.validate(-3, mockCtx)).toBeTruthy();
});

test('maxValueValidator custom error message', () => {
    const validator = maxValueValidator({
        maxValue: 10,
        message: () => 'Value too large',
    });

    const result = validator.validate(15, mockCtx);
    expect(result).toBe('Value too large');
});

test('maxValueValidator passes any reasonable number with MAX_SAFE_INTEGER', () => {
    const validator = maxValueValidator({ maxValue: Number.MAX_SAFE_INTEGER });
    expect(validator.validate(0, mockCtx)).toBeFalsy();
});

test('maxValueValidator has async: false or undefined', () => {
    expect(maxValueValidator({ maxValue: 5 }).async).toBeFalsy();
});
