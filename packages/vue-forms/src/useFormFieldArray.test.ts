import { beforeEach, expect, test, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';

import type { FormField, FormValidator } from './types.js';
import { useForm } from './useForm.js';
import { useFormField } from './useFormField.js';
import { useFormFieldArray } from './useFormFieldArray.js';
import { useFormFields } from './useFormFields.js';

vi.mock('@nzyme/vue-i18n', () => ({
    useLanguage: () => ref('en'),
}));

let scope: ReturnType<typeof effectScope>;

beforeEach(() => {
    scope = effectScope();
});

// Basic Array Field Creation

test('useFormFieldArray creates fields for initial array items', () => {
    scope.run(() => {
        const form = useForm(['a', 'b', 'c']);
        const fields = useFormFieldArray(form);

        expect(fields.length).toBe(3);
        expect(fields[0]!.value).toBe('a');
        expect(fields[1]!.value).toBe('b');
        expect(fields[2]!.value).toBe('c');
    });
});

test('useFormFieldArray creates empty fields array for empty initial array', () => {
    scope.run(() => {
        const form = useForm<string[]>([]);
        const fields = useFormFieldArray(form);

        expect(fields.length).toBe(0);
    });
});

test('useFormFieldArray with validators applies validators to each field', () => {
    scope.run(() => {
        const form = useForm(['', 'valid', '']);
        const requiredValidator: FormValidator<string> = {
            async: false,
            validate: v => (v ? null : 'Required'),
        };

        const fields = useFormFieldArray(form, [requiredValidator]);

        expect(fields.length).toBe(3);
        expect(fields[0]!.valid).toBe(false);
        expect(fields[1]!.valid).toBe(true);
        expect(fields[2]!.valid).toBe(false);
    });
});

test('useFormFieldArray without validators creates fields without validators', () => {
    scope.run(() => {
        const form = useForm(['a', 'b']);
        const fields = useFormFieldArray(form);

        expect(fields[0]!.validators.length).toBe(0);
        expect(fields[1]!.validators.length).toBe(0);
        expect(fields[0]!.valid).toBe(true);
        expect(fields[1]!.valid).toBe(true);
    });
});

// Reactivity - Adding Items

test('useFormFieldArray adds new field when array item is pushed', async () => {
    await scope.run(async () => {
        const form = useForm(['a']);
        const fields = useFormFieldArray(form);

        expect(fields.length).toBe(1);

        form.value.push('b');
        await nextTick();

        expect(fields.length).toBe(2);
        expect(fields[1]!.value).toBe('b');
    });
});

test('useFormFieldArray adds multiple fields when multiple items are pushed', async () => {
    await scope.run(async () => {
        const form = useForm<string[]>([]);
        const fields = useFormFieldArray(form);

        expect(fields.length).toBe(0);

        form.value.push('a', 'b', 'c');
        await nextTick();

        expect(fields.length).toBe(3);
        expect(fields[0]!.value).toBe('a');
        expect(fields[1]!.value).toBe('b');
        expect(fields[2]!.value).toBe('c');
    });
});

test('useFormFieldArray field value syncs with array item', async () => {
    await scope.run(async () => {
        const form = useForm(['initial']);
        const fields = useFormFieldArray(form);

        expect(fields[0]!.value).toBe('initial');

        form.value[0] = 'updated';
        await nextTick();

        expect(fields[0]!.value).toBe('updated');
    });
});

// Reactivity - Removing Items

test('useFormFieldArray removes field when array item is removed', async () => {
    await scope.run(async () => {
        const form = useForm(['a', 'b', 'c']);
        const fields = useFormFieldArray(form);

        expect(fields.length).toBe(3);

        form.value.pop();
        await nextTick();

        expect(fields.length).toBe(2);
    });
});

test('useFormFieldArray stops effect scope when field is removed', async () => {
    await scope.run(async () => {
        const form = useForm(['a', 'b']);

        const fields = useFormFieldArray(form, field => {
            const result = useFormField(field, { validators: [] });
            return result;
        });

        expect(fields.length).toBe(2);

        // Remove last item - its scope should be stopped
        form.value.pop();
        await nextTick();

        expect(fields.length).toBe(1);
    });
});

test('useFormFieldArray handles shrinking array to empty', async () => {
    await scope.run(async () => {
        const form = useForm(['a', 'b', 'c']);
        const fields = useFormFieldArray(form);

        expect(fields.length).toBe(3);

        form.value.length = 0;
        await nextTick();

        expect(fields.length).toBe(0);
    });
});

test('useFormFieldArray handles shrinking array by multiple items', async () => {
    await scope.run(async () => {
        const form = useForm(['a', 'b', 'c', 'd', 'e']);
        const fields = useFormFieldArray(form);

        expect(fields.length).toBe(5);

        form.value.length = 2;
        await nextTick();

        expect(fields.length).toBe(2);
        expect(fields[0]!.value).toBe('a');
        expect(fields[1]!.value).toBe('b');
    });
});

// Validation

test('useFormFieldArray field validation works correctly', async () => {
    await scope.run(async () => {
        const form = useForm(['']);
        const requiredValidator: FormValidator<string> = {
            async: false,
            validate: v => (v ? null : 'Required'),
        };

        const fields = useFormFieldArray(form, [requiredValidator]);

        expect(fields[0]!.valid).toBe(false);
        expect(fields[0]!.invalid).toBe(false); // Not validated yet

        await fields[0]!.validate();

        expect(fields[0]!.invalid).toBe(true);
        expect(fields[0]!.errors).toEqual(['Required']);
    });
});

test('useFormFieldArray form.validate validates all array fields', async () => {
    await scope.run(async () => {
        const form = useForm(['', '']);
        const requiredValidator: FormValidator<string> = {
            async: false,
            validate: v => (v ? null : 'Required'),
        };

        const fields = useFormFieldArray(form, [requiredValidator]);

        const result = await form.validate();

        expect(result).toBe(false);
        expect(fields[0]!.errors).toEqual(['Required']);
        expect(fields[1]!.errors).toEqual(['Required']);
    });
});

test('useFormFieldArray form.valid reflects array fields validity', async () => {
    await scope.run(async () => {
        const form = useForm(['valid', '']);
        const requiredValidator: FormValidator<string> = {
            async: false,
            validate: v => (v ? null : 'Required'),
        };

        useFormFieldArray(form, [requiredValidator]);

        // One field is invalid, so form should be invalid
        expect(form.valid).toBe(false);

        // Make all fields valid
        form.value[1] = 'also valid';
        await nextTick();

        expect(form.valid).toBe(true);
    });
});

test('useFormFieldArray form.invalid reflects array fields invalid state', async () => {
    await scope.run(async () => {
        const form = useForm(['', '']);
        const requiredValidator: FormValidator<string> = {
            async: false,
            validate: v => (v ? null : 'Required'),
        };

        useFormFieldArray(form, [requiredValidator]);

        // Initially not invalid (not validated)
        expect(form.invalid).toBe(false);

        await form.validate();

        expect(form.invalid).toBe(true);

        form.reset();

        expect(form.invalid).toBe(false);
    });
});

// Factory Function

test('useFormFieldArray with factory creates custom field structures', () => {
    scope.run(() => {
        interface Item {
            name: string;
        }

        const form = useForm<Item[]>([{ name: '' }]);

        const fields = useFormFieldArray(form, (field, index) => ({
            field,
            index,
            custom: 'value',
        }));

        expect(fields.length).toBe(1);
        expect(fields[0]!.index).toBe(0);
        expect(fields[0]!.custom).toBe('value');
        expect(fields[0]!.field.value).toEqual({ name: '' });
    });
});

test('useFormFieldArray with factory receives correct field and index', () => {
    scope.run(() => {
        const form = useForm(['a', 'b', 'c']);
        const receivedArgs: Array<{ value: string; index: number }> = [];

        useFormFieldArray(form, (field, index) => {
            receivedArgs.push({ value: field.value, index });
            return useFormField(field, { validators: [] });
        });

        expect(receivedArgs.length).toBe(3);
        expect(receivedArgs[0]).toEqual({ value: 'a', index: 0 });
        expect(receivedArgs[1]).toEqual({ value: 'b', index: 1 });
        expect(receivedArgs[2]).toEqual({ value: 'c', index: 2 });
    });
});

test('useFormFieldArray with factory using useFormFields creates nested fields', () => {
    scope.run(() => {
        interface Person {
            name: string;
            email: string;
        }

        const form = useForm<Person[]>([{ name: '', email: '' }]);

        const requiredValidator: FormValidator<string> = {
            async: false,
            validate: v => (v ? null : 'Required'),
        };

        const fields = useFormFieldArray(form, field =>
            useFormFields(field, {
                name: [requiredValidator],
                email: null,
            }),
        );

        expect(fields.length).toBe(1);
        expect(fields[0]!.name).toBeDefined();
        expect(fields[0]!.email).toBeDefined();
        expect(fields[0]!.name.valid).toBe(false);
        expect(fields[0]!.email.valid).toBe(true);
    });
});

test('useFormFieldArray with factory fields are registered to parent form', () => {
    scope.run(() => {
        const form = useForm(['a', 'b']);

        useFormFieldArray(form, field => useFormField(field, { validators: [] }));

        // Each array item creates a field registered to the form
        expect(form.fields.length).toBe(2);
    });
});

test('useFormFieldArray with factory validates nested structures', async () => {
    await scope.run(async () => {
        interface Person {
            name: string;
            email: string;
        }

        const form = useForm<Person[]>([
            { name: '', email: '' },
            { name: 'valid', email: '' },
        ]);

        const requiredValidator: FormValidator<string> = {
            async: false,
            validate: v => (v ? null : 'Required'),
        };

        const fields = useFormFieldArray(form, field =>
            useFormFields(field, {
                name: [requiredValidator],
                email: null,
            }),
        );

        expect(form.valid).toBe(false);

        const result = await form.validate();

        expect(result).toBe(false);
        expect(fields[0]!.name.errors).toEqual(['Required']);
        expect(fields[1]!.name.errors).toEqual([]); // 'valid' passes
    });
});

// Effect Scope Management

test('useFormFieldArray effect scope is cleaned up when parent scope stops', () => {
    const innerScope = effectScope();

    let fields: FormField<string>[];

    innerScope.run(() => {
        const form = useForm(['a', 'b']);
        fields = useFormFieldArray(form);

        expect(fields.length).toBe(2);
    });

    innerScope.stop();

    // After scope stops, the fields array still exists but reactivity is stopped
    expect(fields!.length).toBe(2);
});

test('useFormFieldArray item scopes are independent', async () => {
    await scope.run(async () => {
        const form = useForm(['a', 'b', 'c']);

        const fields = useFormFieldArray(form, field => {
            const result = useFormField(field, { validators: [] });
            return result;
        });

        expect(fields.length).toBe(3);

        // Remove middle item by replacing array
        form.value = ['a', 'c'];
        await nextTick();

        // Only the removed item's scope should be stopped, not others
        expect(fields.length).toBe(2);
        expect(fields[0]!.value).toBe('a');
        expect(fields[1]!.value).toBe('c');
    });
});

// Edge Cases

test('useFormFieldArray handles replacing entire array', async () => {
    await scope.run(async () => {
        const form = useForm(['a', 'b']);
        const fields = useFormFieldArray(form);

        expect(fields.length).toBe(2);

        form.value = ['x', 'y', 'z'];
        await nextTick();

        expect(fields.length).toBe(3);
        expect(fields[0]!.value).toBe('x');
        expect(fields[1]!.value).toBe('y');
        expect(fields[2]!.value).toBe('z');
    });
});

test('useFormFieldArray handles splice operations', async () => {
    await scope.run(async () => {
        const form = useForm(['a', 'b', 'c', 'd']);
        const fields = useFormFieldArray(form);

        expect(fields.length).toBe(4);

        // Remove 2 items starting at index 1
        form.value.splice(1, 2);
        await nextTick();

        expect(fields.length).toBe(2);
        expect(fields[0]!.value).toBe('a');
        expect(fields[1]!.value).toBe('d');
    });
});

test('useFormFieldArray works with async validators', async () => {
    await scope.run(async () => {
        const form = useForm(['', 'valid']);

        const asyncValidator: FormValidator<string> = {
            async: true,
            validate: async v => {
                await new Promise(resolve => setTimeout(resolve, 10));
                return v ? null : 'Required';
            },
        };

        const fields = useFormFieldArray(form, [asyncValidator]);

        expect(fields.length).toBe(2);

        const result = await form.validate();

        expect(result).toBe(false);
        expect(fields[0]!.errors).toEqual(['Required']);
        expect(fields[1]!.errors).toEqual([]);
    });
});

test('useFormFieldArray newly added items have validators applied', async () => {
    await scope.run(async () => {
        const form = useForm(['valid']);
        const requiredValidator: FormValidator<string> = {
            async: false,
            validate: v => (v ? null : 'Required'),
        };

        const fields = useFormFieldArray(form, [requiredValidator]);

        expect(fields.length).toBe(1);
        expect(fields[0]!.valid).toBe(true);

        // Add an invalid item
        form.value.push('');
        await nextTick();

        expect(fields.length).toBe(2);
        expect(fields[1]!.valid).toBe(false);
    });
});

test('useFormFieldArray works with objects as array items', async () => {
    await scope.run(async () => {
        interface Item {
            id: number;
            name: string;
        }

        const form = useForm<Item[]>([
            { id: 1, name: 'first' },
            { id: 2, name: 'second' },
        ]);

        const fields = useFormFieldArray(form);

        expect(fields.length).toBe(2);
        expect(fields[0]!.value).toEqual({ id: 1, name: 'first' });
        expect(fields[1]!.value).toEqual({ id: 2, name: 'second' });

        // Add new item
        form.value.push({ id: 3, name: 'third' });
        await nextTick();

        expect(fields.length).toBe(3);
        expect(fields[2]!.value).toEqual({ id: 3, name: 'third' });
    });
});

test('useFormFieldArray fields are unregistered when items are removed', async () => {
    await scope.run(async () => {
        const form = useForm(['a', 'b', 'c']);
        useFormFieldArray(form);

        expect(form.fields.length).toBe(3);

        form.value.pop();
        await nextTick();

        expect(form.fields.length).toBe(2);
    });
});

test('useFormFieldArray with factory new items use factory', async () => {
    await scope.run(async () => {
        const form = useForm([1]);

        const fields = useFormFieldArray(form, (field, index) => ({
            field,
            doubled: index * 2,
        }));

        expect(fields[0]!.doubled).toBe(0);

        form.value.push(2);
        await nextTick();

        expect(fields.length).toBe(2);
        expect(fields[1]!.doubled).toBe(2);
    });
});

// Complex nested scenario from the example

test('useFormFieldArray complex nested example works correctly', async () => {
    await scope.run(async () => {
        interface Person {
            name: string;
            email: string;
            age: number;
        }

        const form = useForm<Person[]>([
            { name: '', email: '', age: 0 },
            { name: 'John', email: 'john@example.com', age: 25 },
        ]);

        const requiredValidator: FormValidator<string> = {
            async: false,
            validate: v => (v ? null : 'Required'),
        };

        const emailValidator: FormValidator<string> = {
            async: false,
            validate: v => {
                // Optional
                if (!v) {
                    return null;
                }
                return v.includes('@') ? null : 'Invalid email';
            },
        };

        const fields = useFormFieldArray(form, field =>
            useFormFields(field, {
                name: [requiredValidator],
                email: f =>
                    useFormField(f, {
                        validators: [emailValidator],
                    }),
            }),
        );

        // First person is invalid (empty name)
        expect(fields[0]!.name.valid).toBe(false);
        expect(fields[0]!.email.valid).toBe(true); // Empty is OK

        // Second person is valid
        expect(fields[1]!.name.valid).toBe(true);
        expect(fields[1]!.email.valid).toBe(true);

        // Form overall is invalid
        expect(form.valid).toBe(false);

        // Validate and check errors
        const result = await form.validate();
        expect(result).toBe(false);
        expect(fields[0]!.name.errors).toEqual(['Required']);

        // Fix the error
        form.value[0]!.name = 'Jane';
        await nextTick();

        expect(form.valid).toBe(true);
    });
});
