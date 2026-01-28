import { describe, expect, test } from 'vitest';
import { effectScope, nextTick, reactive, ref } from 'vue';

import type { FormValidationContext } from '../types.js';
import { emailValidator } from './emailValidator.js';
import { maxDateValidator } from './maxDateValidator.js';
import { maxLengthValidator } from './maxLengthValidator.js';
import { maxValueValidator } from './maxValueValidator.js';
import { minDateValidator } from './minDateValidator.js';
import { minLengthValidator } from './minLengthValidator.js';
import { minValueValidator } from './minValueValidator.js';
import { regexValidator } from './regexValidator.js';
import { requiredValidator } from './requiredValidator.js';

const mockCtx: FormValidationContext = {
    lang: 'en',
};

describe('requiredValidator', () => {
    test('returns error for null value', () => {
        const validator = requiredValidator();
        const result = validator.validate(null, mockCtx);
        expect(result).toBeTruthy();
    });

    test('returns error for undefined value', () => {
        const validator = requiredValidator();
        const result = validator.validate(undefined, mockCtx);
        expect(result).toBeTruthy();
    });

    test('returns error for false value', () => {
        const validator = requiredValidator();
        const result = validator.validate(false, mockCtx);
        expect(result).toBeTruthy();
    });

    test('returns error for empty string', () => {
        const validator = requiredValidator();
        const result = validator.validate('', mockCtx);
        expect(result).toBeTruthy();
    });

    test('returns error for whitespace-only string', () => {
        const validator = requiredValidator();
        const result = validator.validate('   ', mockCtx);
        expect(result).toBeTruthy();
    });

    test('returns error for empty array', () => {
        const validator = requiredValidator();
        const result = validator.validate([], mockCtx);
        expect(result).toBeTruthy();
    });

    test('passes for non-empty string', () => {
        const validator = requiredValidator();
        const result = validator.validate('hello', mockCtx);
        expect(result).toBeFalsy();
    });

    test('passes for true value', () => {
        const validator = requiredValidator();
        const result = validator.validate(true, mockCtx);
        expect(result).toBeFalsy();
    });

    test('passes for number including zero', () => {
        const validator = requiredValidator();
        expect(validator.validate(0, mockCtx)).toBeFalsy();
        expect(validator.validate(42, mockCtx)).toBeFalsy();
    });

    test('passes for non-empty array', () => {
        const validator = requiredValidator();
        const result = validator.validate([1, 2, 3], mockCtx);
        expect(result).toBeFalsy();
    });

    test('passes for object', () => {
        const validator = requiredValidator();
        const result = validator.validate({}, mockCtx);
        expect(result).toBeFalsy();
    });

    test('condition ref disables validation when false', () => {
        const condition = ref(false);
        const validator = requiredValidator({ condition });

        const result = validator.validate('', mockCtx);
        expect(result).toBeFalsy();
    });

    test('condition ref enables validation when true', () => {
        const condition = ref(true);
        const validator = requiredValidator({ condition });

        const result = validator.validate('', mockCtx);
        expect(result).toBeTruthy();
    });

    test('condition getter works with reactive source', () => {
        const conditionValue = ref(false);
        const validator = requiredValidator({ condition: () => conditionValue.value });

        expect(validator.validate('', mockCtx)).toBeFalsy();

        conditionValue.value = true;
        expect(validator.validate('', mockCtx)).toBeTruthy();
    });

    test('custom validation logic', () => {
        const validator = requiredValidator({
            custom: (value: unknown) => value === 'specific',
        });

        expect(validator.validate('other', mockCtx)).toBeTruthy();
        expect(validator.validate('specific', mockCtx)).toBeFalsy();
    });

    test('custom error message', () => {
        const validator = requiredValidator({
            message: () => 'Custom required message',
        });

        const result = validator.validate('', mockCtx);
        expect(result).toBe('Custom required message');
    });

    test('behavior shows error when value changes while focused', async () => {
        const scope = effectScope();

        await scope.run(async () => {
            const validator = requiredValidator();
            const ctx = reactive({
                value: '' as string | null | undefined,
                focused: true,
                show: false,
            });

            validator.behavior!(ctx);

            // Change value while focused
            ctx.value = 'new';
            await nextTick();

            expect(ctx.show).toBe(true);
        });

        scope.stop();
    });

    test('lazy option prevents showing error on blur', async () => {
        const scope = effectScope();

        await scope.run(async () => {
            const validator = requiredValidator({ lazy: true });
            const ctx = reactive({
                value: '' as string | null | undefined,
                focused: true,
                show: false,
            });

            validator.behavior!(ctx);

            // Blur without the eager blur watcher
            ctx.focused = false;
            await nextTick();

            // With lazy, blur alone shouldn't trigger show
            // (The behavior only sets show on value change while focused)
            expect(ctx.show).toBe(false);
        });

        scope.stop();
    });

    test('non-lazy option shows error on blur', async () => {
        const scope = effectScope();

        await scope.run(async () => {
            const validator = requiredValidator({ lazy: false });
            const ctx = reactive({
                value: '' as string | null | undefined,
                focused: true,
                show: false,
            });

            validator.behavior!(ctx);

            // Blur
            ctx.focused = false;
            await nextTick();

            expect(ctx.show).toBe(true);
        });

        scope.stop();
    });
});

describe('emailValidator', () => {
    test('passes for valid email', () => {
        const validator = emailValidator();
        expect(validator.validate('test@example.com', mockCtx)).toBeFalsy();
    });

    test('passes for email with subdomain', () => {
        const validator = emailValidator();
        expect(validator.validate('user@mail.example.com', mockCtx)).toBeFalsy();
    });

    test('passes for email with plus sign', () => {
        const validator = emailValidator();
        expect(validator.validate('user+tag@example.com', mockCtx)).toBeFalsy();
    });

    test('returns error for invalid email', () => {
        const validator = emailValidator();
        expect(validator.validate('invalid', mockCtx)).toBeTruthy();
    });

    test('returns error for email without domain', () => {
        const validator = emailValidator();
        expect(validator.validate('user@', mockCtx)).toBeTruthy();
    });

    test('returns error for email without @', () => {
        const validator = emailValidator();
        expect(validator.validate('userexample.com', mockCtx)).toBeTruthy();
    });

    test('passes for empty string (not required)', () => {
        const validator = emailValidator();
        expect(validator.validate('', mockCtx)).toBeFalsy();
    });

    test('passes for null (not required)', () => {
        const validator = emailValidator();
        expect(validator.validate(null, mockCtx)).toBeFalsy();
    });

    test('passes for whitespace-only (trimmed to empty)', () => {
        const validator = emailValidator();
        expect(validator.validate('   ', mockCtx)).toBeFalsy();
    });

    test('custom error message', () => {
        const validator = emailValidator({
            message: () => 'Please enter a valid email',
        });

        const result = validator.validate('invalid', mockCtx);
        expect(result).toBe('Please enter a valid email');
    });
});

describe('minLengthValidator', () => {
    test('passes when length meets minimum', () => {
        const validator = minLengthValidator({ minLength: 5 });
        expect(validator.validate('hello', mockCtx)).toBeFalsy();
    });

    test('passes when length exceeds minimum', () => {
        const validator = minLengthValidator({ minLength: 3 });
        expect(validator.validate('hello', mockCtx)).toBeFalsy();
    });

    test('returns error when length below minimum', () => {
        const validator = minLengthValidator({ minLength: 10 });
        expect(validator.validate('hello', mockCtx)).toBeTruthy();
    });

    test('passes for null value', () => {
        const validator = minLengthValidator({ minLength: 5 });
        expect(validator.validate(null, mockCtx)).toBeFalsy();
    });

    test('passes for undefined value', () => {
        const validator = minLengthValidator({ minLength: 5 });
        expect(validator.validate(undefined, mockCtx)).toBeFalsy();
    });

    test('works with array length', () => {
        const validator = minLengthValidator({ minLength: 3 });
        expect(validator.validate([1, 2, 3], mockCtx)).toBeFalsy();
        expect(validator.validate([1, 2], mockCtx)).toBeTruthy();
    });

    test('exclusive mode requires strictly greater than', () => {
        const validator = minLengthValidator({ minLength: 5, exclusive: true });
        expect(validator.validate('hello', mockCtx)).toBeTruthy(); // length 5 not > 5
        expect(validator.validate('hello!', mockCtx)).toBeFalsy(); // length 6 > 5
    });

    test('ref minLength updates dynamically', () => {
        const minLength = ref(3);
        const validator = minLengthValidator({ minLength });

        expect(validator.validate('hi', mockCtx)).toBeTruthy();

        minLength.value = 2;
        expect(validator.validate('hi', mockCtx)).toBeFalsy();
    });

    test('getter minLength works with reactive source', () => {
        const min = ref(3);
        const validator = minLengthValidator({ minLength: () => min.value });

        expect(validator.validate('hi', mockCtx)).toBeTruthy();

        min.value = 2;
        expect(validator.validate('hi', mockCtx)).toBeFalsy();
    });

    test('custom error message', () => {
        const validator = minLengthValidator({
            minLength: 5,
            message: () => 'Too short',
        });

        const result = validator.validate('hi', mockCtx);
        expect(result).toBe('Too short');
    });
});

describe('maxLengthValidator', () => {
    test('passes when length at maximum', () => {
        const validator = maxLengthValidator({ maxLength: 5 });
        expect(validator.validate('hello', mockCtx)).toBeFalsy();
    });

    test('passes when length below maximum', () => {
        const validator = maxLengthValidator({ maxLength: 10 });
        expect(validator.validate('hello', mockCtx)).toBeFalsy();
    });

    test('returns error when length exceeds maximum', () => {
        const validator = maxLengthValidator({ maxLength: 3 });
        expect(validator.validate('hello', mockCtx)).toBeTruthy();
    });

    test('passes for null value', () => {
        const validator = maxLengthValidator({ maxLength: 5 });
        expect(validator.validate(null, mockCtx)).toBeFalsy();
    });

    test('works with array length', () => {
        const validator = maxLengthValidator({ maxLength: 3 });
        expect(validator.validate([1, 2, 3], mockCtx)).toBeFalsy();
        expect(validator.validate([1, 2, 3, 4], mockCtx)).toBeTruthy();
    });

    test('exclusive mode requires strictly less than', () => {
        const validator = maxLengthValidator({ maxLength: 5, exclusive: true });
        expect(validator.validate('hello', mockCtx)).toBeTruthy(); // length 5 not < 5
        expect(validator.validate('hell', mockCtx)).toBeFalsy(); // length 4 < 5
    });

    test('ref maxLength updates dynamically', () => {
        const maxLength = ref(3);
        const validator = maxLengthValidator({ maxLength });

        expect(validator.validate('hello', mockCtx)).toBeTruthy();

        maxLength.value = 10;
        expect(validator.validate('hello', mockCtx)).toBeFalsy();
    });

    test('custom error message', () => {
        const validator = maxLengthValidator({
            maxLength: 3,
            message: () => 'Too long',
        });

        const result = validator.validate('hello', mockCtx);
        expect(result).toBe('Too long');
    });
});

describe('minValueValidator', () => {
    test('passes when value equals minimum', () => {
        const validator = minValueValidator({ minValue: 10 });
        expect(validator.validate(10, mockCtx)).toBeFalsy();
    });

    test('passes when value exceeds minimum', () => {
        const validator = minValueValidator({ minValue: 10 });
        expect(validator.validate(15, mockCtx)).toBeFalsy();
    });

    test('returns error when value below minimum', () => {
        const validator = minValueValidator({ minValue: 10 });
        expect(validator.validate(5, mockCtx)).toBeTruthy();
    });

    test('passes for null value', () => {
        const validator = minValueValidator({ minValue: 10 });
        expect(validator.validate(null, mockCtx)).toBeFalsy();
    });

    test('works with bigint', () => {
        const validator = minValueValidator({ minValue: 100n });
        expect(validator.validate(100n, mockCtx)).toBeFalsy();
        expect(validator.validate(99n, mockCtx)).toBeTruthy();
    });

    test('exclusive mode requires strictly greater than', () => {
        const validator = minValueValidator({ minValue: 10, exclusive: true });
        expect(validator.validate(10, mockCtx)).toBeTruthy(); // 10 not > 10
        expect(validator.validate(11, mockCtx)).toBeFalsy(); // 11 > 10
    });

    test('ref minValue updates dynamically', () => {
        const minValue = ref(10);
        const validator = minValueValidator({ minValue });

        expect(validator.validate(5, mockCtx)).toBeTruthy();

        minValue.value = 3;
        expect(validator.validate(5, mockCtx)).toBeFalsy();
    });

    test('works with zero', () => {
        const validator = minValueValidator({ minValue: 0 });
        expect(validator.validate(0, mockCtx)).toBeFalsy();
        expect(validator.validate(-1, mockCtx)).toBeTruthy();
    });

    test('works with negative numbers', () => {
        const validator = minValueValidator({ minValue: -10 });
        expect(validator.validate(-5, mockCtx)).toBeFalsy();
        expect(validator.validate(-15, mockCtx)).toBeTruthy();
    });

    test('custom error message', () => {
        const validator = minValueValidator({
            minValue: 10,
            message: () => 'Value too small',
        });

        const result = validator.validate(5, mockCtx);
        expect(result).toBe('Value too small');
    });
});

describe('maxValueValidator', () => {
    test('passes when value equals maximum', () => {
        const validator = maxValueValidator({ maxValue: 10 });
        expect(validator.validate(10, mockCtx)).toBeFalsy();
    });

    test('passes when value below maximum', () => {
        const validator = maxValueValidator({ maxValue: 10 });
        expect(validator.validate(5, mockCtx)).toBeFalsy();
    });

    test('returns error when value exceeds maximum', () => {
        const validator = maxValueValidator({ maxValue: 10 });
        expect(validator.validate(15, mockCtx)).toBeTruthy();
    });

    test('passes for null value', () => {
        const validator = maxValueValidator({ maxValue: 10 });
        expect(validator.validate(null, mockCtx)).toBeFalsy();
    });

    test('works with bigint', () => {
        const validator = maxValueValidator({ maxValue: 100n });
        expect(validator.validate(100n, mockCtx)).toBeFalsy();
        expect(validator.validate(101n, mockCtx)).toBeTruthy();
    });

    test('exclusive mode requires strictly less than', () => {
        const validator = maxValueValidator({ maxValue: 10, exclusive: true });
        expect(validator.validate(10, mockCtx)).toBeTruthy(); // 10 not < 10
        expect(validator.validate(9, mockCtx)).toBeFalsy(); // 9 < 10
    });

    test('ref maxValue updates dynamically', () => {
        const maxValue = ref(10);
        const validator = maxValueValidator({ maxValue });

        expect(validator.validate(15, mockCtx)).toBeTruthy();

        maxValue.value = 20;
        expect(validator.validate(15, mockCtx)).toBeFalsy();
    });

    test('works with zero', () => {
        const validator = maxValueValidator({ maxValue: 0 });
        expect(validator.validate(0, mockCtx)).toBeFalsy();
        expect(validator.validate(1, mockCtx)).toBeTruthy();
    });

    test('works with negative numbers', () => {
        const validator = maxValueValidator({ maxValue: -5 });
        expect(validator.validate(-10, mockCtx)).toBeFalsy();
        expect(validator.validate(-3, mockCtx)).toBeTruthy();
    });

    test('custom error message', () => {
        const validator = maxValueValidator({
            maxValue: 10,
            message: () => 'Value too large',
        });

        const result = validator.validate(15, mockCtx);
        expect(result).toBe('Value too large');
    });
});

describe('regexValidator', () => {
    test('passes when value matches regex', () => {
        const validator = regexValidator({ regex: /^[A-Z]+$/ });
        expect(validator.validate('HELLO', mockCtx)).toBeFalsy();
    });

    test('returns error when value does not match regex', () => {
        const validator = regexValidator({ regex: /^[A-Z]+$/ });
        expect(validator.validate('hello', mockCtx)).toBeTruthy();
    });

    test('passes for empty string (not required)', () => {
        const validator = regexValidator({ regex: /^[A-Z]+$/ });
        expect(validator.validate('', mockCtx)).toBeFalsy();
    });

    test('passes for null (not required)', () => {
        const validator = regexValidator({ regex: /^[A-Z]+$/ });
        expect(validator.validate(null, mockCtx)).toBeFalsy();
    });

    test('works with complex patterns', () => {
        // Phone number pattern
        const validator = regexValidator({ regex: /^\+?[0-9]{10,14}$/ });
        expect(validator.validate('+12345678901', mockCtx)).toBeFalsy();
        expect(validator.validate('abc', mockCtx)).toBeTruthy();
    });

    test('ref regex updates dynamically', () => {
        const regex = ref(/^[A-Z]+$/);
        const validator = regexValidator({ regex });

        expect(validator.validate('hello', mockCtx)).toBeTruthy();

        regex.value = /^[a-z]+$/;
        expect(validator.validate('hello', mockCtx)).toBeFalsy();
    });

    test('getter regex works with reactive source', () => {
        const pattern = ref(/^[A-Z]+$/);
        const validator = regexValidator({ regex: () => pattern.value });

        expect(validator.validate('hello', mockCtx)).toBeTruthy();

        pattern.value = /^[a-z]+$/;
        expect(validator.validate('hello', mockCtx)).toBeFalsy();
    });

    test('custom error message', () => {
        const validator = regexValidator({
            regex: /^[A-Z]+$/,
            message: () => 'Must be uppercase',
        });

        const result = validator.validate('hello', mockCtx);
        expect(result).toBe('Must be uppercase');
    });
});

describe('minDateValidator', () => {
    const baseDate = new Date('2024-01-15');

    test('passes when date equals minimum', () => {
        const validator = minDateValidator({ minDate: baseDate });
        expect(validator.validate(new Date('2024-01-15'), mockCtx)).toBeFalsy();
    });

    test('passes when date after minimum', () => {
        const validator = minDateValidator({ minDate: baseDate });
        expect(validator.validate(new Date('2024-02-01'), mockCtx)).toBeFalsy();
    });

    test('returns error when date before minimum', () => {
        const validator = minDateValidator({ minDate: baseDate });
        expect(validator.validate(new Date('2024-01-01'), mockCtx)).toBeTruthy();
    });

    test('passes for null value', () => {
        const validator = minDateValidator({ minDate: baseDate });
        expect(validator.validate(null, mockCtx)).toBeFalsy();
    });

    test('passes for non-Date value', () => {
        const validator = minDateValidator({ minDate: baseDate });
        expect(validator.validate('not a date' as unknown as Date, mockCtx)).toBeFalsy();
    });

    test('exclusive mode requires strictly after', () => {
        const validator = minDateValidator({ minDate: baseDate, exclusive: true });
        expect(validator.validate(new Date('2024-01-15'), mockCtx)).toBeTruthy(); // same date not after
        expect(validator.validate(new Date('2024-01-16'), mockCtx)).toBeFalsy(); // next day is after
    });

    test('ref minDate updates dynamically', () => {
        const minDate = ref(new Date('2024-01-15'));
        const validator = minDateValidator({ minDate });

        expect(validator.validate(new Date('2024-01-10'), mockCtx)).toBeTruthy();

        minDate.value = new Date('2024-01-05');
        expect(validator.validate(new Date('2024-01-10'), mockCtx)).toBeFalsy();
    });

    test('custom error message', () => {
        const validator = minDateValidator({
            minDate: baseDate,
            message: () => 'Date is too early',
        });

        const result = validator.validate(new Date('2024-01-01'), mockCtx);
        expect(result).toBe('Date is too early');
    });
});

describe('maxDateValidator', () => {
    const baseDate = new Date('2024-01-15');

    test('passes when date equals maximum', () => {
        const validator = maxDateValidator({ maxDate: baseDate });
        expect(validator.validate(new Date('2024-01-15'), mockCtx)).toBeFalsy();
    });

    test('passes when date before maximum', () => {
        const validator = maxDateValidator({ maxDate: baseDate });
        expect(validator.validate(new Date('2024-01-01'), mockCtx)).toBeFalsy();
    });

    test('returns error when date after maximum', () => {
        const validator = maxDateValidator({ maxDate: baseDate });
        expect(validator.validate(new Date('2024-02-01'), mockCtx)).toBeTruthy();
    });

    test('passes for non-Date value', () => {
        const validator = maxDateValidator({ maxDate: baseDate });
        expect(validator.validate('not a date' as unknown as Date, mockCtx)).toBeFalsy();
    });

    test('exclusive mode requires strictly before', () => {
        const validator = maxDateValidator({ maxDate: baseDate, exclusive: true });
        expect(validator.validate(new Date('2024-01-15'), mockCtx)).toBeTruthy(); // same date not before
        expect(validator.validate(new Date('2024-01-14'), mockCtx)).toBeFalsy(); // prev day is before
    });

    test('ref maxDate updates dynamically', () => {
        const maxDate = ref(new Date('2024-01-15'));
        const validator = maxDateValidator({ maxDate });

        expect(validator.validate(new Date('2024-01-20'), mockCtx)).toBeTruthy();

        maxDate.value = new Date('2024-01-25');
        expect(validator.validate(new Date('2024-01-20'), mockCtx)).toBeFalsy();
    });

    test('custom error message', () => {
        const validator = maxDateValidator({
            maxDate: baseDate,
            message: () => 'Date is too late',
        });

        const result = validator.validate(new Date('2024-02-01'), mockCtx);
        expect(result).toBe('Date is too late');
    });
});

describe('validator async property', () => {
    test('sync validators have async: false or undefined', () => {
        expect(requiredValidator().async).toBeFalsy();
        expect(emailValidator().async).toBeFalsy();
        expect(minLengthValidator({ minLength: 5 }).async).toBeFalsy();
        expect(maxLengthValidator({ maxLength: 5 }).async).toBeFalsy();
        expect(minValueValidator({ minValue: 5 }).async).toBeFalsy();
        expect(maxValueValidator({ maxValue: 5 }).async).toBeFalsy();
        expect(regexValidator({ regex: /test/ }).async).toBeFalsy();
        expect(minDateValidator({ minDate: new Date() }).async).toBeFalsy();
        expect(maxDateValidator({ maxDate: new Date() }).async).toBeFalsy();
    });
});

describe('edge cases', () => {
    test('validators handle edge case values', () => {
        const required = requiredValidator();
        const minLength = minLengthValidator({ minLength: 0 });
        const maxLength = maxLengthValidator({ maxLength: 0 });
        const minValue = minValueValidator({ minValue: Number.MIN_SAFE_INTEGER });
        const maxValue = maxValueValidator({ maxValue: Number.MAX_SAFE_INTEGER });

        // Empty string with minLength 0 should pass
        expect(minLength.validate('', mockCtx)).toBeFalsy();

        // Empty string with maxLength 0 should pass
        expect(maxLength.validate('', mockCtx)).toBeFalsy();

        // Any reasonable number should pass with MIN_SAFE_INTEGER
        expect(minValue.validate(0, mockCtx)).toBeFalsy();

        // Any reasonable number should pass with MAX_SAFE_INTEGER
        expect(maxValue.validate(0, mockCtx)).toBeFalsy();
    });

    test('validators handle special string values', () => {
        const email = emailValidator();

        // Various edge cases for email
        // Note: a@b.c is NOT valid per the @nzyme/validation library (requires proper TLD)
        expect(email.validate('a@b.c', mockCtx)).toBeTruthy(); // invalid - too short TLD
        expect(email.validate('a@example.com', mockCtx)).toBeFalsy(); // valid email
        expect(email.validate('@domain.com', mockCtx)).toBeTruthy(); // missing local part
        expect(email.validate('user@', mockCtx)).toBeTruthy(); // missing domain
    });

    test('date validators handle time component', () => {
        const baseDate = new Date('2024-01-15T12:00:00');
        const minDate = minDateValidator({ minDate: baseDate });
        const maxDate = maxDateValidator({ maxDate: baseDate });

        // Same date, earlier time
        expect(minDate.validate(new Date('2024-01-15T06:00:00'), mockCtx)).toBeTruthy();

        // Same date, later time
        expect(maxDate.validate(new Date('2024-01-15T18:00:00'), mockCtx)).toBeTruthy();

        // Same date, same time
        expect(minDate.validate(new Date('2024-01-15T12:00:00'), mockCtx)).toBeFalsy();
        expect(maxDate.validate(new Date('2024-01-15T12:00:00'), mockCtx)).toBeFalsy();
    });

    test('length validators work with objects having length property', () => {
        const minLength = minLengthValidator({ minLength: 3 });
        const maxLength = maxLengthValidator({ maxLength: 5 });

        const objWithLength = { length: 4, other: 'property' };

        expect(minLength.validate(objWithLength as unknown as string, mockCtx)).toBeFalsy();
        expect(maxLength.validate(objWithLength as unknown as string, mockCtx)).toBeFalsy();
    });
});
