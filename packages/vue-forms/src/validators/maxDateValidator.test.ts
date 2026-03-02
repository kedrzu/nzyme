import { expect, test } from 'bun:test';
import { ref } from 'vue';

import type { FormValidationContext } from '../types.js';
import { maxDateValidator } from './maxDateValidator.js';

const mockCtx: FormValidationContext = {
    lang: 'en',
};

const baseDate = new Date('2024-01-15');

test('maxDateValidator passes when date equals maximum', () => {
    const validator = maxDateValidator({ maxDate: baseDate });
    expect(validator.validate(new Date('2024-01-15'), mockCtx)).toBeFalsy();
});

test('maxDateValidator passes when date before maximum', () => {
    const validator = maxDateValidator({ maxDate: baseDate });
    expect(validator.validate(new Date('2024-01-01'), mockCtx)).toBeFalsy();
});

test('maxDateValidator returns error when date after maximum', () => {
    const validator = maxDateValidator({ maxDate: baseDate });
    expect(validator.validate(new Date('2024-02-01'), mockCtx)).toBeTruthy();
});

test('maxDateValidator passes for non-Date value', () => {
    const validator = maxDateValidator({ maxDate: baseDate });
    expect(validator.validate('not a date' as unknown as Date, mockCtx)).toBeFalsy();
});

test('maxDateValidator exclusive mode requires strictly before', () => {
    const validator = maxDateValidator({ maxDate: baseDate, exclusive: true });
    expect(validator.validate(new Date('2024-01-15'), mockCtx)).toBeTruthy(); // same date not before
    expect(validator.validate(new Date('2024-01-14'), mockCtx)).toBeFalsy(); // prev day is before
});

test('maxDateValidator ref maxDate updates dynamically', () => {
    const maxDate = ref(new Date('2024-01-15'));
    const validator = maxDateValidator({ maxDate });

    expect(validator.validate(new Date('2024-01-20'), mockCtx)).toBeTruthy();

    maxDate.value = new Date('2024-01-25');
    expect(validator.validate(new Date('2024-01-20'), mockCtx)).toBeFalsy();
});

test('maxDateValidator custom error message', () => {
    const validator = maxDateValidator({
        maxDate: baseDate,
        message: () => 'Date is too late',
    });

    const result = validator.validate(new Date('2024-02-01'), mockCtx);
    expect(result).toBe('Date is too late');
});

test('maxDateValidator handles time component - same date later time fails', () => {
    const baseDateWithTime = new Date('2024-01-15T12:00:00');
    const validator = maxDateValidator({ maxDate: baseDateWithTime });
    expect(validator.validate(new Date('2024-01-15T18:00:00'), mockCtx)).toBeTruthy();
});

test('maxDateValidator handles time component - same date same time passes', () => {
    const baseDateWithTime = new Date('2024-01-15T12:00:00');
    const validator = maxDateValidator({ maxDate: baseDateWithTime });
    expect(validator.validate(new Date('2024-01-15T12:00:00'), mockCtx)).toBeFalsy();
});

test('maxDateValidator has async: false or undefined', () => {
    expect(maxDateValidator({ maxDate: new Date() }).async).toBeFalsy();
});
