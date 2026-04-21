import { expect, test } from 'bun:test';
import { ref } from 'vue';

import type { FormValidationContext } from '../types.js';
import { minDateValidator } from './minDateValidator.js';

const mockCtx: FormValidationContext = {
    lang: 'en',
};

const baseDate = new Date('2024-01-15');

test('minDateValidator passes when date equals minimum', () => {
    const validator = minDateValidator({ minDate: baseDate });
    expect(validator.validate(new Date('2024-01-15'), mockCtx)).toBeFalsy();
});

test('minDateValidator passes when date after minimum', () => {
    const validator = minDateValidator({ minDate: baseDate });
    expect(validator.validate(new Date('2024-02-01'), mockCtx)).toBeFalsy();
});

test('minDateValidator returns error when date before minimum', () => {
    const validator = minDateValidator({ minDate: baseDate });
    expect(validator.validate(new Date('2024-01-01'), mockCtx)).toBeTruthy();
});

test('minDateValidator passes for null value', () => {
    const validator = minDateValidator({ minDate: baseDate });
    expect(validator.validate(null, mockCtx)).toBeFalsy();
});

test('minDateValidator passes for non-Date value', () => {
    const validator = minDateValidator({ minDate: baseDate });
    expect(validator.validate('not a date' as unknown as Date, mockCtx)).toBeFalsy();
});

test('minDateValidator exclusive mode requires strictly after', () => {
    const validator = minDateValidator({ minDate: baseDate, exclusive: true });
    expect(validator.validate(new Date('2024-01-15'), mockCtx)).toBeTruthy(); // same date not after
    expect(validator.validate(new Date('2024-01-16'), mockCtx)).toBeFalsy(); // next day is after
});

test('minDateValidator ref minDate updates dynamically', () => {
    const minDate = ref(new Date('2024-01-15'));
    const validator = minDateValidator({ minDate });

    expect(validator.validate(new Date('2024-01-10'), mockCtx)).toBeTruthy();

    minDate.value = new Date('2024-01-05');
    expect(validator.validate(new Date('2024-01-10'), mockCtx)).toBeFalsy();
});

test('minDateValidator custom error message', () => {
    const validator = minDateValidator({
        minDate: baseDate,
        message: () => 'Date is too early',
    });

    const result = validator.validate(new Date('2024-01-01'), mockCtx);
    expect(result).toBe('Date is too early');
});

test('minDateValidator handles time component - same date earlier time fails', () => {
    const baseDateWithTime = new Date('2024-01-15T12:00:00');
    const validator = minDateValidator({ minDate: baseDateWithTime });
    expect(validator.validate(new Date('2024-01-15T06:00:00'), mockCtx)).toBeTruthy();
});

test('minDateValidator handles time component - same date same time passes', () => {
    const baseDateWithTime = new Date('2024-01-15T12:00:00');
    const validator = minDateValidator({ minDate: baseDateWithTime });
    expect(validator.validate(new Date('2024-01-15T12:00:00'), mockCtx)).toBeFalsy();
});

test('minDateValidator has async: false or undefined', () => {
    expect(minDateValidator({ minDate: new Date() }).async).toBeFalsy();
});
