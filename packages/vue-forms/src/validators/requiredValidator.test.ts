import { expect, test } from 'vitest';
import { effectScope, nextTick, reactive, ref } from 'vue';

import type { FormValidationContext } from '../types.js';
import { requiredValidator } from './requiredValidator.js';

const mockCtx: FormValidationContext = {
    lang: 'en',
};

test('requiredValidator returns error for null value', () => {
    const validator = requiredValidator();
    const result = validator.validate(null, mockCtx);
    expect(result).toBeTruthy();
});

test('requiredValidator returns error for undefined value', () => {
    const validator = requiredValidator();
    const result = validator.validate(undefined, mockCtx);
    expect(result).toBeTruthy();
});

test('requiredValidator returns error for false value', () => {
    const validator = requiredValidator();
    const result = validator.validate(false, mockCtx);
    expect(result).toBeTruthy();
});

test('requiredValidator returns error for empty string', () => {
    const validator = requiredValidator();
    const result = validator.validate('', mockCtx);
    expect(result).toBeTruthy();
});

test('requiredValidator returns error for whitespace-only string', () => {
    const validator = requiredValidator();
    const result = validator.validate('   ', mockCtx);
    expect(result).toBeTruthy();
});

test('requiredValidator returns error for empty array', () => {
    const validator = requiredValidator();
    const result = validator.validate([], mockCtx);
    expect(result).toBeTruthy();
});

test('requiredValidator passes for non-empty string', () => {
    const validator = requiredValidator();
    const result = validator.validate('hello', mockCtx);
    expect(result).toBeFalsy();
});

test('requiredValidator passes for true value', () => {
    const validator = requiredValidator();
    const result = validator.validate(true, mockCtx);
    expect(result).toBeFalsy();
});

test('requiredValidator passes for number including zero', () => {
    const validator = requiredValidator();
    expect(validator.validate(0, mockCtx)).toBeFalsy();
    expect(validator.validate(42, mockCtx)).toBeFalsy();
});

test('requiredValidator passes for non-empty array', () => {
    const validator = requiredValidator();
    const result = validator.validate([1, 2, 3], mockCtx);
    expect(result).toBeFalsy();
});

test('requiredValidator passes for object', () => {
    const validator = requiredValidator();
    const result = validator.validate({}, mockCtx);
    expect(result).toBeFalsy();
});

test('requiredValidator condition ref disables validation when false', () => {
    const condition = ref(false);
    const validator = requiredValidator({ condition });

    const result = validator.validate('', mockCtx);
    expect(result).toBeFalsy();
});

test('requiredValidator condition ref enables validation when true', () => {
    const condition = ref(true);
    const validator = requiredValidator({ condition });

    const result = validator.validate('', mockCtx);
    expect(result).toBeTruthy();
});

test('requiredValidator condition getter works with reactive source', () => {
    const conditionValue = ref(false);
    const validator = requiredValidator({ condition: () => conditionValue.value });

    expect(validator.validate('', mockCtx)).toBeFalsy();

    conditionValue.value = true;
    expect(validator.validate('', mockCtx)).toBeTruthy();
});

test('requiredValidator custom validation logic', () => {
    const validator = requiredValidator({
        custom: (value: unknown) => value === 'specific',
    });

    expect(validator.validate('other', mockCtx)).toBeTruthy();
    expect(validator.validate('specific', mockCtx)).toBeFalsy();
});

test('requiredValidator custom error message', () => {
    const validator = requiredValidator({
        message: () => 'Custom required message',
    });

    const result = validator.validate('', mockCtx);
    expect(result).toBe('Custom required message');
});

test('requiredValidator behavior shows error when value changes while focused', async () => {
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

test('requiredValidator lazy option prevents showing error on blur', async () => {
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

test('requiredValidator non-lazy option shows error on blur', async () => {
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

test('requiredValidator has async: false or undefined', () => {
    expect(requiredValidator().async).toBeFalsy();
});
