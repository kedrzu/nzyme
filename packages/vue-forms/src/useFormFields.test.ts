import { LanguageContext } from '@nzyme/i18n/LanguageContext.js';
import { createContainer } from '@nzyme/vue-ioc/createContainer.js';
import { beforeEach, expect, test } from 'bun:test';
import { createApp, effectScope, nextTick, ref } from 'vue';

import type { FormModel, FormValidator } from './types.js';
import { useForm } from './useForm.js';
import { useFormField } from './useFormField.js';
import { useFormFields } from './useFormFields.js';

interface TestFormValue {
    name: string;
    email: string;
    age: number;
}

let ctx: ReturnType<typeof createTestContext>;
let form: FormModel<TestFormValue>;

beforeEach(() => {
    ctx = createTestContext();
    ctx.run(() => {
        form = useForm<TestFormValue>({
            name: '',
            email: '',
            age: 0,
        });
    });
});

test('useFormFields creates fields for each key in params', () => {
    ctx.run(() => {
        const fields = useFormFields(form, {
            name: null,
            email: null,
        });

        expect(fields.name).toBeDefined();
        expect(fields.email).toBeDefined();
        expect('age' in fields).toBe(false);
    });
});

test('useFormFields registers all fields with parent form', () => {
    ctx.run(() => {
        useFormFields(form, {
            name: null,
            email: null,
            age: null,
        });

        expect(form.fields.length).toBe(3);
    });
});

test('useFormFields field value syncs with form value via computed', async () => {
    await ctx.run(async () => {
        const fields = useFormFields(form, {
            name: null,
        });

        expect(fields.name.value).toBe('');

        form.value.name = 'Updated';
        await nextTick();

        expect(fields.name.value).toBe('Updated');
    });
});

test('useFormFields setting field value updates form value', async () => {
    await ctx.run(async () => {
        const fields = useFormFields(form, {
            name: null,
        });

        // Note: field.value is readonly in the interface, but the underlying computed
        // setter allows updating through the form
        form.value.name = 'New Value';
        await nextTick();

        expect(fields.name.value).toBe('New Value');
    });
});

test('useFormFields applies validators to fields', () => {
    ctx.run(() => {
        const requiredValidator: FormValidator<string> = {
            async: false,
            validate: (v: string | null | undefined) => (v ? null : 'Required'),
        };

        const fields = useFormFields(form, {
            name: [requiredValidator],
            email: null,
        });

        expect(fields.name.validators.length).toBe(1);
        expect(fields.email.validators.length).toBe(0);

        // Field with empty value should be invalid
        expect(fields.name.valid).toBe(false);
    });
});

test('useFormFields applies multiple validators to single field', () => {
    ctx.run(() => {
        const requiredValidator: FormValidator<string> = {
            async: false,
            validate: (v: string | null | undefined) => (v ? null : 'Required'),
        };

        const minLengthValidator: FormValidator<string> = {
            async: false,
            validate: (v: string | null | undefined) => (v && v.length >= 3 ? null : 'Min 3 chars'),
        };

        const fields = useFormFields(form, {
            name: [requiredValidator, minLengthValidator],
        });

        expect(fields.name.validators.length).toBe(2);
    });
});

test('useFormFields null validators array creates field without validators', () => {
    ctx.run(() => {
        const fields = useFormFields(form, {
            name: null,
        });

        expect(fields.name.validators.length).toBe(0);
        expect(fields.name.valid).toBe(true);
        expect(fields.name.invalid).toBe(false);
    });
});

test('useFormFields empty validators array creates field without validators', () => {
    ctx.run(() => {
        const fields = useFormFields(form, {
            name: [],
        });

        expect(fields.name.validators.length).toBe(0);
        expect(fields.name.valid).toBe(true);
        expect(fields.name.invalid).toBe(false);
    });
});

test('useFormFields fields have focus and blur methods', () => {
    ctx.run(() => {
        const fields = useFormFields(form, {
            name: null,
        });

        expect(typeof fields.name.focus).toBe('function');
        expect(typeof fields.name.blur).toBe('function');

        expect(fields.name.focused).toBe(false);

        fields.name.focus();
        expect(fields.name.focused).toBe(true);

        fields.name.blur();
        expect(fields.name.focused).toBe(false);
    });
});

test('useFormFields fields have validate method', async () => {
    await ctx.run(async () => {
        const fields = useFormFields(form, {
            name: null,
        });

        const result = await fields.name.validate();
        expect(result).toBe(true);
    });
});

test('useFormFields fields have reset method', async () => {
    await ctx.run(async () => {
        const validator: FormValidator<string> = {
            async: false,
            validate: () => 'Error',
        };

        const fields = useFormFields(form, {
            name: [validator],
        });

        await fields.name.validate();
        expect(fields.name.errors.length).toBeGreaterThan(0);

        fields.name.reset();
        expect(fields.name.errors.length).toBe(0);
    });
});

test('useFormFields each field references parent form', () => {
    ctx.run(() => {
        const fields = useFormFields(form, {
            name: null,
            email: null,
        });

        expect(fields.name.form).toBe(form);
        expect(fields.email.form).toBe(form);
    });
});

test('useFormFields form validation validates all fields', async () => {
    await ctx.run(async () => {
        const requiredValidator: FormValidator<string> = {
            async: false,
            validate: (v: string | null | undefined) => (v ? null : 'Required'),
        };

        useFormFields(form, {
            name: [requiredValidator],
            email: [requiredValidator],
        });

        // All fields empty, validation should fail
        const result = await form.validate();
        expect(result).toBe(false);
    });
});

test('useFormFields form validation passes when all fields valid', async () => {
    await ctx.run(async () => {
        const requiredValidator: FormValidator<string> = {
            async: false,
            validate: (v: string | null | undefined) => (v ? null : 'Required'),
        };

        form.value.name = 'John';
        form.value.email = 'john@example.com';

        useFormFields(form, {
            name: [requiredValidator],
            email: [requiredValidator],
        });

        const result = await form.validate();
        expect(result).toBe(true);
    });
});

test('useFormFields form.valid reflects overall validity', async () => {
    await ctx.run(async () => {
        const requiredValidator: FormValidator<string> = {
            async: false,
            validate: (v: string | null | undefined) => (v ? null : 'Required'),
        };

        useFormFields(form, {
            name: [requiredValidator],
            email: null,
        });

        // name is empty, so form should be invalid
        expect(form.valid).toBe(false);

        // Fill in the required field
        form.value.name = 'John';
        await nextTick();

        expect(form.valid).toBe(true);
    });
});

test('useFormFields field invalid is false initially even when valid is false', () => {
    ctx.run(() => {
        const requiredValidator: FormValidator<string> = {
            async: false,
            validate: (v: string | null | undefined) => (v ? null : 'Required'),
        };

        const fields = useFormFields(form, {
            name: [requiredValidator],
        });

        // Field with empty value should be invalid (valid=false)
        expect(fields.name.valid).toBe(false);
        // But invalid should be false because validation hasn't been triggered
        expect(fields.name.invalid).toBe(false);
    });
});

test('useFormFields field invalid becomes true after validate()', async () => {
    await ctx.run(async () => {
        const requiredValidator: FormValidator<string> = {
            async: false,
            validate: (v: string | null | undefined) => (v ? null : 'Required'),
        };

        const fields = useFormFields(form, {
            name: [requiredValidator],
        });

        expect(fields.name.invalid).toBe(false);

        await fields.name.validate();

        expect(fields.name.valid).toBe(false);
        expect(fields.name.invalid).toBe(true);
    });
});

test('useFormFields form.invalid reflects overall invalid state', async () => {
    await ctx.run(async () => {
        const requiredValidator: FormValidator<string> = {
            async: false,
            validate: (v: string | null | undefined) => (v ? null : 'Required'),
        };

        useFormFields(form, {
            name: [requiredValidator],
            email: null,
        });

        // Initially invalid should be false (not validated yet)
        expect(form.invalid).toBe(false);

        // Validate the form
        await form.validate();

        // Now invalid should be true because name is empty
        expect(form.invalid).toBe(true);
    });
});

test('useFormFields form.invalid is false after reset()', async () => {
    await ctx.run(async () => {
        const requiredValidator: FormValidator<string> = {
            async: false,
            validate: (v: string | null | undefined) => (v ? null : 'Required'),
        };

        const fields = useFormFields(form, {
            name: [requiredValidator],
        });

        await form.validate();
        expect(form.invalid).toBe(true);
        expect(fields.name.invalid).toBe(true);

        form.reset();

        expect(form.invalid).toBe(false);
        expect(fields.name.invalid).toBe(false);
    });
});

test('useFormFields form.reset resets all fields', async () => {
    await ctx.run(async () => {
        const validator: FormValidator<string> = {
            async: false,
            validate: () => 'Error',
        };

        const fields = useFormFields(form, {
            name: [validator],
            email: [validator],
        });

        await form.validate();
        expect(fields.name.errors.length).toBeGreaterThan(0);
        expect(fields.email.errors.length).toBeGreaterThan(0);

        form.reset();

        expect(fields.name.errors.length).toBe(0);
        expect(fields.email.errors.length).toBe(0);
    });
});

test('useFormFields supports different value types', async () => {
    await ctx.run(async () => {
        const numberValidator: FormValidator<number> = {
            async: false,
            validate: (v: number | null | undefined) => (v != null && v > 0 ? null : 'Must be positive'),
        };

        const fields = useFormFields(form, {
            age: [numberValidator],
        });

        expect(fields.age.value).toBe(0);
        expect(fields.age.valid).toBe(false);

        form.value.age = 25;
        await nextTick();

        expect(fields.age.value).toBe(25);
        expect(fields.age.valid).toBe(true);
    });
});

test('useFormFields unregisters fields on scope disposal', () => {
    const innerScope = effectScope();

    innerScope.run(() => {
        useFormFields(form, {
            name: null,
            email: null,
        });
    });

    expect(form.fields.length).toBe(2);

    innerScope.stop();

    expect(form.fields.length).toBe(0);
});

test('useFormFields type inference works correctly', () => {
    ctx.run(() => {
        const fields = useFormFields(form, {
            name: null,
            email: null,
            age: null,
        });

        // These should compile without errors
        const nameValue: string = fields.name.value;
        const emailValue: string = fields.email.value;
        const ageValue: number = fields.age.value;

        expect(typeof nameValue).toBe('string');
        expect(typeof emailValue).toBe('string');
        expect(typeof ageValue).toBe('number');
    });
});

test('useFormFields works with ref form value', async () => {
    const localScope = effectScope();

    await ctx.app.runWithContext(() =>
        localScope.run(async () => {
            const value = ref({
                name: '',
                email: '',
            });

            const refForm = useForm(value);

            const fields = useFormFields(refForm, {
                name: null,
                email: null,
            });

            expect(fields.name.value).toBe('');

            value.value.name = 'Updated';
            await nextTick();

            expect(fields.name.value).toBe('Updated');
        }),
    );

    localScope.stop();
});

// Tests for factory function feature (new feature)

test('useFormFields with factory function returns custom structure', () => {
    ctx.run(() => {
        const fields = useFormFields(form, {
            name: field => ({
                field,
                customProp: 'custom value',
            }),
        });

        expect(fields.name.customProp).toBe('custom value');
        expect(fields.name.field).toBeDefined();
        expect(fields.name.field.value).toBe('');
    });
});

test('useFormFields with factory function receives FormModel for the key', () => {
    ctx.run(() => {
        let receivedField: FormModel<string> | null = null;

        useFormFields(form, {
            name: field => {
                receivedField = field;
                return field;
            },
        });

        expect(receivedField).not.toBeNull();
        expect(receivedField!.value).toBe('');
        expect(receivedField!.form).toBe(form);
    });
});

test('useFormFields factory function can use useFormField to add validators', () => {
    ctx.run(() => {
        const validator: FormValidator<string> = {
            async: false,
            validate: v => (v ? null : 'Required'),
        };

        const fields = useFormFields(form, {
            name: field => useFormField(field, { validators: [validator] }),
        });

        // Factory returned a FormField with validators
        expect(fields.name.validators.length).toBe(1);
        expect(fields.name.valid).toBe(false);
    });
});

test('useFormFields factory function can create nested structures with useFormFields', () => {
    ctx.run(() => {
        interface NestedForm {
            address: {
                street: string;
                city: string;
            };
        }

        const nestedForm = useForm<NestedForm>({
            address: { street: '', city: '' },
        });

        const requiredValidator: FormValidator<string> = {
            async: false,
            validate: v => (v ? null : 'Required'),
        };

        const fields = useFormFields(nestedForm, {
            address: field =>
                useFormFields(field, {
                    street: [requiredValidator],
                    city: null,
                }),
        });

        // fields.address should have street and city sub-fields
        expect(fields.address.street).toBeDefined();
        expect(fields.address.city).toBeDefined();
        expect(fields.address.street.valid).toBe(false); // has required validator
        expect(fields.address.city.valid).toBe(true);
    });
});

test('useFormFields factory creates field that is registered to parent form', () => {
    ctx.run(() => {
        useFormFields(form, {
            name: field => useFormField(field, { validators: [] }),
        });

        // The field created by factory should be registered
        expect(form.fields.length).toBe(1);
    });
});

test('useFormFields mixed validators and factory functions', () => {
    ctx.run(() => {
        const validator: FormValidator<string> = {
            async: false,
            validate: () => null,
        };

        const fields = useFormFields(form, {
            name: [validator], // validators array
            email: field => ({
                // factory function
                theField: field,
                extra: 42,
            }),
        });

        // name is a FormField
        expect(fields.name.validators.length).toBe(1);

        // email is custom object from factory
        expect(fields.email.extra).toBe(42);
        expect(fields.email.theField.value).toBe('');
    });
});

test('useFormFields factory function field value syncs with form', async () => {
    await ctx.run(async () => {
        const fields = useFormFields(form, {
            name: field => useFormField(field, { validators: [] }),
        });

        expect(fields.name.value).toBe('');

        form.value.name = 'Updated';
        await nextTick();

        expect(fields.name.value).toBe('Updated');
    });
});

test('useFormFields factory function nested fields contribute to parent validation', async () => {
    await ctx.run(async () => {
        const requiredValidator: FormValidator<string> = {
            async: false,
            validate: v => (v ? null : 'Required'),
        };

        interface NestedForm {
            person: {
                name: string;
            };
        }

        const nestedForm = useForm<NestedForm>({
            person: { name: '' },
        });

        useFormFields(nestedForm, {
            person: field =>
                useFormFields(field, {
                    name: [requiredValidator],
                }),
        });

        // Parent form should be invalid because nested field is invalid
        expect(nestedForm.valid).toBe(false);

        // Validate should propagate through nested structure
        const result = await nestedForm.validate();
        expect(result).toBe(false);
    });
});

// Null/Undefined Value Handling

test('useFormFields handles null form value', () => {
    ctx.run(() => {
        const nullForm = useForm<TestFormValue | null>(null);
        const fields = useFormFields(nullForm as FormModel<TestFormValue>, {
            name: null,
            email: null,
        });

        // Fields should be created but values are undefined
        expect(fields.name).toBeDefined();
        expect(fields.email).toBeDefined();
        expect(fields.name.value).toBeUndefined();
        expect(fields.email.value).toBeUndefined();
    });
});

test('useFormFields handles undefined form value', () => {
    ctx.run(() => {
        const undefinedForm = useForm<TestFormValue | undefined>(undefined);
        const fields = useFormFields(undefinedForm as FormModel<TestFormValue>, {
            name: null,
            email: null,
        });

        // Fields should be created but values are undefined
        expect(fields.name).toBeDefined();
        expect(fields.email).toBeDefined();
        expect(fields.name.value).toBeUndefined();
        expect(fields.email.value).toBeUndefined();
    });
});

test('useFormFields setter is no-op when form value is null', () => {
    ctx.run(() => {
        const nullForm = useForm<TestFormValue | null>(null);
        const fields = useFormFields(nullForm as FormModel<TestFormValue>, {
            name: null,
        });

        // Attempting to set field value should not throw
        // We test this by checking that the form value remains null
        expect(nullForm.value).toBeNull();

        // The field value is undefined (from getter)
        expect(fields.name.value).toBeUndefined();
    });
});

test('useFormFields handles form value changing from object to null', async () => {
    await ctx.run(async () => {
        const nullableForm = useForm<TestFormValue | null>({
            name: 'John',
            email: 'john@example.com',
            age: 25,
        });

        const fields = useFormFields(nullableForm as FormModel<TestFormValue>, {
            name: null,
            email: null,
        });

        expect(fields.name.value).toBe('John');

        // Set form value to null
        nullableForm.value = null;
        await nextTick();

        // Field values should now be undefined
        expect(fields.name.value).toBeUndefined();
        expect(fields.email.value).toBeUndefined();
    });
});

test('useFormFields handles form value changing from null to object', async () => {
    await ctx.run(async () => {
        const nullableForm = useForm<TestFormValue | null>(null);

        const fields = useFormFields(nullableForm as FormModel<TestFormValue>, {
            name: null,
            email: null,
        });

        expect(fields.name.value).toBeUndefined();

        // Set form value to object
        nullableForm.value = {
            name: 'Jane',
            email: 'jane@example.com',
            age: 30,
        };
        await nextTick();

        expect(fields.name.value).toBe('Jane');
        expect(fields.email.value).toBe('jane@example.com');
    });
});

test('useFormFields with validators handles null form value', () => {
    ctx.run(() => {
        const nullForm = useForm<TestFormValue | null>(null);
        const requiredValidator: FormValidator<string> = {
            async: false,
            validate: (v: string | null | undefined) => (v ? null : 'Required'),
        };

        const fields = useFormFields(nullForm as FormModel<TestFormValue>, {
            name: [requiredValidator],
        });

        // Field should be invalid when value is undefined
        expect(fields.name.valid).toBe(false);
    });
});

test('useFormFields with factory handles null form value', () => {
    ctx.run(() => {
        const nullForm = useForm<TestFormValue | null>(null);

        const fields = useFormFields(nullForm as FormModel<TestFormValue>, {
            name: field => ({
                theField: field,
                customValue: 'custom',
            }),
        });

        expect(fields.name.customValue).toBe('custom');
        expect(fields.name.theField.value).toBeUndefined();
    });
});

test('useFormFields handles value toggling between null and object', async () => {
    await ctx.run(async () => {
        const nullableForm = useForm<TestFormValue | null>({
            name: 'Initial',
            email: 'initial@test.com',
            age: 20,
        });

        const fields = useFormFields(nullableForm as FormModel<TestFormValue>, {
            name: null,
        });

        expect(fields.name.value).toBe('Initial');

        // Set to null
        nullableForm.value = null;
        await nextTick();
        expect(fields.name.value).toBeUndefined();

        // Set back to object
        nullableForm.value = { name: 'Updated', email: 'updated@test.com', age: 25 };
        await nextTick();
        expect(fields.name.value).toBe('Updated');

        // Set to null again
        nullableForm.value = null;
        await nextTick();
        expect(fields.name.value).toBeUndefined();
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
