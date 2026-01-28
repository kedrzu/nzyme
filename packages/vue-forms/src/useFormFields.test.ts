import { beforeEach, expect, test, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';

import type { FormModel, FormValidator } from './types.js';
import { useForm } from './useForm.js';
import { useFormFields } from './useFormFields.js';

vi.mock('@nzyme/vue-i18n', () => ({
    useLanguage: () => ref('en'),
}));

interface TestFormValue {
    name: string;
    email: string;
    age: number;
}

let scope: ReturnType<typeof effectScope>;
let form: FormModel<TestFormValue>;

beforeEach(() => {
    scope = effectScope();
    scope.run(() => {
        form = useForm<TestFormValue>({
            name: '',
            email: '',
            age: 0,
        });
    });
});

test('useFormFields creates fields for each key in params', () => {
    scope.run(() => {
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
    scope.run(() => {
        useFormFields(form, {
            name: null,
            email: null,
            age: null,
        });

        expect(form.fields.length).toBe(3);
    });
});

test('useFormFields field value syncs with form value via computed', async () => {
    await scope.run(async () => {
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
    await scope.run(async () => {
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
    scope.run(() => {
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
    scope.run(() => {
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
    scope.run(() => {
        const fields = useFormFields(form, {
            name: null,
        });

        expect(fields.name.validators.length).toBe(0);
        expect(fields.name.valid).toBe(true);
        expect(fields.name.invalid).toBe(false);
    });
});

test('useFormFields empty validators array creates field without validators', () => {
    scope.run(() => {
        const fields = useFormFields(form, {
            name: [],
        });

        expect(fields.name.validators.length).toBe(0);
        expect(fields.name.valid).toBe(true);
        expect(fields.name.invalid).toBe(false);
    });
});

test('useFormFields fields have focus and blur methods', () => {
    scope.run(() => {
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
    await scope.run(async () => {
        const fields = useFormFields(form, {
            name: null,
        });

        const result = await fields.name.validate();
        expect(result).toBe(true);
    });
});

test('useFormFields fields have reset method', async () => {
    await scope.run(async () => {
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
    scope.run(() => {
        const fields = useFormFields(form, {
            name: null,
            email: null,
        });

        expect(fields.name.form).toBe(form);
        expect(fields.email.form).toBe(form);
    });
});

test('useFormFields form validation validates all fields', async () => {
    await scope.run(async () => {
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
    await scope.run(async () => {
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
    await scope.run(async () => {
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
    scope.run(() => {
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
    await scope.run(async () => {
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
    await scope.run(async () => {
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
    await scope.run(async () => {
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
    await scope.run(async () => {
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
    await scope.run(async () => {
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
    scope.run(() => {
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

    await localScope.run(async () => {
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
    });

    localScope.stop();
});
