import { beforeEach, expect, test } from 'vitest';
import { createApp, effectScope, ref } from 'vue';

import { LanguageContext } from '@nzyme/i18n/LanguageContext.js';
import { createContainer } from '@nzyme/vue-ioc/createContainer.js';

import type { FormValidator } from './types.js';
import { useForm } from './useForm.js';
import { useFormField } from './useFormField.js';

let ctx: ReturnType<typeof createTestContext>;

beforeEach(() => {
    ctx = createTestContext();
});

test('useForm creates form model with initial value', () => {
    ctx.run(() => {
        const initialValue = { name: 'John', age: 30 };
        const form = useForm(initialValue);

        expect(form.value).toEqual({ name: 'John', age: 30 });
        expect(form.fields).toEqual([]);
        expect(form.valid).toBe(true);
        expect(form.invalid).toBe(false);
    });
});

test('useForm creates form model with ref value', () => {
    ctx.run(() => {
        const initialValue = ref({ name: 'Jane', age: 25 });
        const form = useForm(initialValue);

        expect(form.value).toEqual({ name: 'Jane', age: 25 });
        expect(form.fields).toEqual([]);
    });
});

test('useForm form.form returns itself', () => {
    ctx.run(() => {
        const form = useForm({ name: '' });

        expect(form.form).toBe(form);
    });
});

test('useForm valid is true when all fields are valid', () => {
    ctx.run(() => {
        const form = useForm({ name: '', email: '' });
        const nameValue = ref('John');
        const emailValue = ref('john@example.com');

        useFormField(form, { value: nameValue });
        useFormField(form, { value: emailValue });

        expect(form.valid).toBe(true);
    });
});

test('useForm valid is false when any field is invalid', () => {
    ctx.run(() => {
        const form = useForm({ name: '' });
        const nameValue = ref('');

        const requiredValidator: FormValidator<string> = {
            async: false,
            validate: (v: string | null | undefined) => (v ? null : 'Required'),
        };

        useFormField(form, { value: nameValue, validators: [requiredValidator] });

        expect(form.valid).toBe(false);
    });
});

test('useForm invalid is false initially even when valid is false', () => {
    ctx.run(() => {
        const form = useForm({ name: '' });
        const nameValue = ref('');

        const requiredValidator: FormValidator<string> = {
            async: false,
            validate: (v: string | null | undefined) => (v ? null : 'Required'),
        };

        useFormField(form, { value: nameValue, validators: [requiredValidator] });

        // valid is false because validator fails
        expect(form.valid).toBe(false);
        // but invalid should be false because form hasn't been validated yet
        expect(form.invalid).toBe(false);
    });
});

test('useForm invalid becomes true after validate() fails', async () => {
    await ctx.run(async () => {
        const form = useForm({ name: '' });
        const nameValue = ref('');

        const requiredValidator: FormValidator<string> = {
            async: false,
            validate: (v: string | null | undefined) => (v ? null : 'Required'),
        };

        useFormField(form, { value: nameValue, validators: [requiredValidator] });

        expect(form.invalid).toBe(false);

        await form.validate();

        expect(form.valid).toBe(false);
        expect(form.invalid).toBe(true);
    });
});

test('useForm invalid is false when validation passes', async () => {
    await ctx.run(async () => {
        const form = useForm({ name: '' });
        const nameValue = ref('John');

        const requiredValidator: FormValidator<string> = {
            async: false,
            validate: (v: string | null | undefined) => (v ? null : 'Required'),
        };

        useFormField(form, { value: nameValue, validators: [requiredValidator] });

        await form.validate();

        expect(form.valid).toBe(true);
        expect(form.invalid).toBe(false);
    });
});

test('useForm invalid returns to false after reset()', async () => {
    await ctx.run(async () => {
        const form = useForm({ name: '' });
        const nameValue = ref('');

        const requiredValidator: FormValidator<string> = {
            async: false,
            validate: (v: string | null | undefined) => (v ? null : 'Required'),
        };

        useFormField(form, { value: nameValue, validators: [requiredValidator] });

        await form.validate();
        expect(form.invalid).toBe(true);

        form.reset();

        expect(form.invalid).toBe(false);
    });
});

test('useForm validate returns true when all fields validate successfully', async () => {
    await ctx.run(async () => {
        const form = useForm({ name: '', email: '' });
        const nameValue = ref('John');
        const emailValue = ref('john@example.com');

        useFormField(form, { value: nameValue });
        useFormField(form, { value: emailValue });

        const result = await form.validate();

        expect(result).toBe(true);
    });
});

test('useForm validate returns false when any field fails validation', async () => {
    await ctx.run(async () => {
        const form = useForm({ name: '' });
        const nameValue = ref('');

        const requiredValidator: FormValidator<string> = {
            async: false,
            validate: (v: string | null | undefined) => (v ? null : 'Required'),
        };

        useFormField(form, { value: nameValue, validators: [requiredValidator] });

        const result = await form.validate();

        expect(result).toBe(false);
    });
});

test('useForm validate runs all validations in parallel', async () => {
    await ctx.run(async () => {
        const form = useForm({ name: '', email: '' });
        const callOrder: number[] = [];

        const nameValue = ref('John');
        const emailValue = ref('john@example.com');

        const slowValidator: FormValidator<string> = {
            async: true,
            validate: async () => {
                callOrder.push(1);
                await new Promise(resolve => setTimeout(resolve, 50));
                callOrder.push(2);
                return null;
            },
        };

        const fastValidator: FormValidator<string> = {
            async: true,
            validate: async () => {
                callOrder.push(3);
                await new Promise(resolve => setTimeout(resolve, 10));
                callOrder.push(4);
                return null;
            },
        };

        useFormField(form, { value: nameValue, validators: [slowValidator] });
        useFormField(form, { value: emailValue, validators: [fastValidator] });

        await form.validate();

        // Both should start before either finishes (parallel execution)
        expect(callOrder[0]).toBe(1);
        expect(callOrder[1]).toBe(3);
    });
});

test('useForm reset calls reset on all fields', async () => {
    await ctx.run(async () => {
        const form = useForm({ name: '', email: '' });
        const nameValue = ref('');
        const emailValue = ref('');

        const requiredValidator: FormValidator<string> = {
            async: false,
            validate: (v: string | null | undefined) => (v ? null : 'Required'),
        };

        const nameField = useFormField(form, { value: nameValue, validators: [requiredValidator] });
        const emailField = useFormField(form, { value: emailValue, validators: [requiredValidator] });

        // Trigger validation to show errors
        await form.validate();

        expect(nameField.errors.length).toBeGreaterThan(0);
        expect(emailField.errors.length).toBeGreaterThan(0);

        form.reset();

        expect(nameField.errors.length).toBe(0);
        expect(emailField.errors.length).toBe(0);
    });
});

test('useForm updates value reactively', () => {
    ctx.run(() => {
        const value = ref({ name: 'Initial' });
        const form = useForm(value);

        expect(form.value.name).toBe('Initial');

        value.value.name = 'Updated';

        expect(form.value.name).toBe('Updated');
    });
});

test('useForm lang is available from context', () => {
    ctx.run(() => {
        const form = useForm({ name: '' });

        expect(form.lang).toBe('en');
    });
});

test('useForm fields are registered and unregistered correctly', () => {
    ctx.run(() => {
        const form = useForm({ name: '' });
        const innerScope = effectScope();

        expect(form.fields.length).toBe(0);

        innerScope.run(() => {
            const nameValue = ref('John');
            useFormField(form, { value: nameValue });
        });

        expect(form.fields.length).toBe(1);

        innerScope.stop();

        expect(form.fields.length).toBe(0);
    });
});

function createTestContext() {
    const app = createApp({ render: () => null });
    const container = createContainer();
    container.set(LanguageContext, () => 'en');
    app.provide(container.injectionKey, container);

    const scope = effectScope();

    return {
        app,
        container,
        scope,
        run<T>(fn: () => T): T {
            return app.runWithContext(() => scope.run(fn))!;
        },
    };
}
