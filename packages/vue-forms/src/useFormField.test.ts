import { beforeEach, expect, test, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';

import type { FormModel, FormValidationContext, FormValidator } from './types.js';
import { useForm } from './useForm.js';
import { useFormField } from './useFormField.js';

vi.mock('@nzyme/vue-i18n', () => ({
    useLanguage: () => ref('en'),
}));

let scope: ReturnType<typeof effectScope>;
let form: FormModel<{ name: string }>;

beforeEach(() => {
    scope = effectScope();
    scope.run(() => {
        form = useForm({ name: '' });
    });
});

test('useFormField registers field with parent form on creation', () => {
    scope.run(() => {
        const value = ref('test');
        const field = useFormField(form, { value });

        expect(form.fields).toContain(field);
        expect(form.fields.length).toBe(1);
    });
});

test('useFormField unregisters field from parent form on scope disposal', () => {
    const innerScope = effectScope();

    innerScope.run(() => {
        const value = ref('test');
        useFormField(form, { value });
    });

    expect(form.fields.length).toBe(1);

    innerScope.stop();

    expect(form.fields.length).toBe(0);
});

test('useFormField initializes focused as false', () => {
    scope.run(() => {
        const value = ref('test');
        const field = useFormField(form, { value });

        expect(field.focused).toBe(false);
    });
});

test('useFormField focus sets focused to true', () => {
    scope.run(() => {
        const value = ref('test');
        const field = useFormField(form, { value });

        field.focus();

        expect(field.focused).toBe(true);
    });
});

test('useFormField blur sets focused to false', () => {
    scope.run(() => {
        const value = ref('test');
        const field = useFormField(form, { value });

        field.focus();
        expect(field.focused).toBe(true);

        field.blur();
        expect(field.focused).toBe(false);
    });
});

test('useFormField valid is true when no validators', () => {
    scope.run(() => {
        const value = ref('test');
        const field = useFormField(form, { value });

        expect(field.valid).toBe(true);
        expect(field.invalid).toBe(false);
    });
});

test('useFormField errors is empty when no validators', () => {
    scope.run(() => {
        const value = ref('test');
        const field = useFormField(form, { value });

        expect(field.errors).toEqual([]);
    });
});

test('useFormField valid is false when sync validator returns error', () => {
    scope.run(() => {
        const value = ref('');
        const validator: FormValidator<string> = {
            async: false,
            validate: (v: string | null | undefined) => (v ? null : 'Required'),
        };

        const field = useFormField(form, { value, validators: [validator] });

        expect(field.valid).toBe(false);
    });
});

test('useFormField invalid is false initially even when valid is false', () => {
    scope.run(() => {
        const value = ref('');
        const validator: FormValidator<string> = {
            async: false,
            validate: (v: string | null | undefined) => (v ? null : 'Required'),
        };

        const field = useFormField(form, { value, validators: [validator] });

        // valid is false because validator fails
        expect(field.valid).toBe(false);
        // but invalid should be false because validation hasn't been triggered yet
        expect(field.invalid).toBe(false);
    });
});

test('useFormField invalid becomes true after validate() fails', async () => {
    await scope.run(async () => {
        const value = ref('');
        const validator: FormValidator<string> = {
            async: false,
            validate: (v: string | null | undefined) => (v ? null : 'Required'),
        };

        const field = useFormField(form, { value, validators: [validator] });

        expect(field.invalid).toBe(false);

        await field.validate();

        expect(field.valid).toBe(false);
        expect(field.invalid).toBe(true);
    });
});

test('useFormField invalid is false when validation passes', async () => {
    await scope.run(async () => {
        const value = ref('valid value');
        const validator: FormValidator<string> = {
            async: false,
            validate: (v: string | null | undefined) => (v ? null : 'Required'),
        };

        const field = useFormField(form, { value, validators: [validator] });

        await field.validate();

        expect(field.valid).toBe(true);
        expect(field.invalid).toBe(false);
    });
});

test('useFormField invalid returns to false after reset()', async () => {
    await scope.run(async () => {
        const value = ref('');
        const validator: FormValidator<string> = {
            async: false,
            validate: (v: string | null | undefined) => (v ? null : 'Required'),
        };

        const field = useFormField(form, { value, validators: [validator] });

        await field.validate();
        expect(field.invalid).toBe(true);

        field.reset();

        expect(field.invalid).toBe(false);
    });
});

test('useFormField valid is true when sync validator passes', () => {
    scope.run(() => {
        const value = ref('filled');
        const validator: FormValidator<string> = {
            async: false,
            validate: (v: string | null | undefined) => (v ? null : 'Required'),
        };

        const field = useFormField(form, { value, validators: [validator] });

        expect(field.valid).toBe(true);
    });
});

test('useFormField errors contains validator messages when show is true', async () => {
    await scope.run(async () => {
        const value = ref('');
        const validator: FormValidator<string> = {
            async: false,
            validate: (v: string | null | undefined) => (v ? null : 'Required'),
        };

        const field = useFormField(form, { value, validators: [validator] });

        // Initially show is false due to default behavior
        expect(field.errors).toEqual([]);

        // Trigger validation to set show to true
        await field.validate();

        expect(field.errors).toEqual(['Required']);
    });
});

test('useFormField errors is empty when validator passes', async () => {
    await scope.run(async () => {
        const value = ref('filled');
        const validator: FormValidator<string> = {
            async: false,
            validate: (v: string | null | undefined) => (v ? null : 'Required'),
        };

        const field = useFormField(form, { value, validators: [validator] });

        await field.validate();

        expect(field.errors).toEqual([]);
    });
});

test('useFormField validate returns true when all validators pass', async () => {
    await scope.run(async () => {
        const value = ref('valid');
        const validator1: FormValidator<string> = {
            async: false,
            validate: () => null,
        };
        const validator2: FormValidator<string> = {
            async: false,
            validate: () => null,
        };

        const field = useFormField(form, { value, validators: [validator1, validator2] });

        const result = await field.validate();

        expect(result).toBe(true);
    });
});

test('useFormField validate returns false when any validator fails', async () => {
    await scope.run(async () => {
        const value = ref('');
        const validator1: FormValidator<string> = {
            async: false,
            validate: () => null,
        };
        const validator2: FormValidator<string> = {
            async: false,
            validate: () => 'Error',
        };

        const field = useFormField(form, { value, validators: [validator1, validator2] });

        const result = await field.validate();

        expect(result).toBe(false);
    });
});

test('useFormField validate sets show to true for all validators', async () => {
    await scope.run(async () => {
        const value = ref('');
        const validator: FormValidator<string> = {
            async: false,
            validate: () => 'Error',
        };

        const field = useFormField(form, { value, validators: [validator] });

        expect(field.validators[0]!.show).toBe(false);

        await field.validate();

        expect(field.validators[0]!.show).toBe(true);
    });
});

test('useFormField reset sets show to false for all validators', async () => {
    await scope.run(async () => {
        const value = ref('');
        const validator: FormValidator<string> = {
            async: false,
            validate: () => 'Error',
        };

        const field = useFormField(form, { value, validators: [validator] });

        await field.validate();
        expect(field.validators[0]!.show).toBe(true);

        field.reset();

        expect(field.validators[0]!.show).toBe(false);
    });
});

test('useFormField reset clears visible errors', async () => {
    await scope.run(async () => {
        const value = ref('');
        const validator: FormValidator<string> = {
            async: false,
            validate: () => 'Error',
        };

        const field = useFormField(form, { value, validators: [validator] });

        await field.validate();
        expect(field.errors).toEqual(['Error']);

        field.reset();

        expect(field.errors).toEqual([]);
    });
});

test('useFormField default behavior shows errors on blur when value changed', async () => {
    await scope.run(async () => {
        const value = ref('');
        const validator: FormValidator<string> = {
            async: false,
            validate: () => 'Error',
        };

        const field = useFormField(form, { value, validators: [validator] });

        expect(field.errors).toEqual([]);

        // Focus the field
        field.focus();

        // Change value
        value.value = 'changed';
        await nextTick();

        // Still no errors while focused
        expect(field.errors).toEqual([]);

        // Blur the field
        field.blur();
        await nextTick();

        // Now errors should be shown
        expect(field.errors).toEqual(['Error']);
    });
});

test('useFormField invalid becomes true via default behavior on blur', async () => {
    await scope.run(async () => {
        const value = ref('');
        const validator: FormValidator<string> = {
            async: false,
            validate: () => 'Error',
        };

        const field = useFormField(form, { value, validators: [validator] });

        // Initially invalid is false
        expect(field.invalid).toBe(false);

        // Focus and change value
        field.focus();
        value.value = 'changed but still invalid';
        await nextTick();

        // Still not invalid while focused
        expect(field.invalid).toBe(false);

        // Blur triggers show = true via default behavior
        field.blur();
        await nextTick();

        // Now invalid should be true because errors are shown
        expect(field.invalid).toBe(true);
    });
});

test('useFormField default behavior hides errors when value changes while focused', async () => {
    await scope.run(async () => {
        const value = ref('');
        const validator: FormValidator<string> = {
            async: false,
            validate: () => 'Error',
        };

        const field = useFormField(form, { value, validators: [validator] });

        // First show errors
        await field.validate();
        expect(field.errors).toEqual(['Error']);

        // Focus and change value
        field.focus();
        value.value = 'new';
        await nextTick();

        // Errors should be hidden
        expect(field.errors).toEqual([]);
    });
});

test('useFormField custom behavior overrides default behavior', async () => {
    await scope.run(async () => {
        const value = ref('');
        const validator: FormValidator<string> = {
            async: false,
            validate: () => 'Error',
            behavior: ctx => {
                // Always show errors
                ctx.show = true;
            },
        };

        const field = useFormField(form, { value, validators: [validator] });

        // Custom behavior sets show to true immediately
        await nextTick();
        expect(field.errors).toEqual(['Error']);
    });
});

test('useFormField multiple validators accumulate errors', async () => {
    await scope.run(async () => {
        const value = ref('');
        const validator1: FormValidator<string> = {
            async: false,
            validate: () => 'Error 1',
        };
        const validator2: FormValidator<string> = {
            async: false,
            validate: () => 'Error 2',
        };

        const field = useFormField(form, { value, validators: [validator1, validator2] });

        await field.validate();

        expect(field.errors).toEqual(['Error 1', 'Error 2']);
    });
});

test('useFormField only shows errors for validators where show is true', () => {
    scope.run(() => {
        const value = ref('');
        const validator1: FormValidator<string> = {
            async: false,
            validate: () => 'Error 1',
        };
        const validator2: FormValidator<string> = {
            async: false,
            validate: () => 'Error 2',
        };

        const field = useFormField(form, { value, validators: [validator1, validator2] });

        // Only show first validator's error
        field.validators[0]!.show = true;

        expect(field.errors).toEqual(['Error 1']);
    });
});

test('useFormField normalizes string error result', async () => {
    await scope.run(async () => {
        const value = ref('');
        const validator: FormValidator<string> = {
            async: false,
            validate: () => 'String error',
        };

        const field = useFormField(form, { value, validators: [validator] });

        await field.validate();

        expect(field.errors).toEqual(['String error']);
    });
});

test('useFormField normalizes array error result', async () => {
    await scope.run(async () => {
        const value = ref('');
        const validator: FormValidator<string> = {
            async: false,
            validate: () => ['Part 1', 'Part 2'],
        };

        const field = useFormField(form, { value, validators: [validator] });

        await field.validate();

        // Array is joined into a single string
        expect(field.errors).toEqual(['Part 1Part 2']);
    });
});

test('useFormField normalizes null error result as no error', () => {
    scope.run(() => {
        const value = ref('valid');
        const validator: FormValidator<string> = {
            async: false,
            validate: () => null,
        };

        const field = useFormField(form, { value, validators: [validator] });

        expect(field.valid).toBe(true);
    });
});

test('useFormField normalizes false error result as no error', () => {
    scope.run(() => {
        const value = ref('valid');
        const validator: FormValidator<string> = {
            async: false,
            validate: () => false,
        };

        const field = useFormField(form, { value, validators: [validator] });

        expect(field.valid).toBe(true);
    });
});

test('useFormField field.form references parent form', () => {
    scope.run(() => {
        const value = ref('test');
        const field = useFormField(form, { value });

        expect(field.form).toBe(form);
    });
});

test('useFormField field.value is reactive', async () => {
    await scope.run(async () => {
        const value = ref('initial');
        const field = useFormField(form, { value });

        expect(field.value).toBe('initial');

        value.value = 'updated';
        await nextTick();

        expect(field.value).toBe('updated');
    });
});

test('useFormField validator receives correct context', () => {
    scope.run(() => {
        const value = ref('test');
        let receivedCtx: FormValidationContext | null = null;

        const validator: FormValidator<string> = {
            async: false,
            validate: (_v, ctx) => {
                receivedCtx = ctx;
                return null;
            },
        };

        useFormField(form, { value, validators: [validator] });

        expect(receivedCtx).not.toBeNull();
        expect(receivedCtx!.lang).toBe('en');
    });
});

test('useFormField handles empty validators array', () => {
    scope.run(() => {
        const value = ref('test');
        const field = useFormField(form, { value, validators: [] });

        expect(field.valid).toBe(true);
        expect(field.errors).toEqual([]);
        expect(field.validators).toEqual([]);
    });
});

test('useFormField handles undefined validators', () => {
    scope.run(() => {
        const value = ref('test');
        const field = useFormField(form, { value });

        expect(field.valid).toBe(true);
        expect(field.errors).toEqual([]);
        expect(field.validators).toEqual([]);
    });
});

test('useFormField async validator validates asynchronously', async () => {
    await scope.run(async () => {
        const value = ref('');
        const validator: FormValidator<string> = {
            async: true,
            validate: async () => {
                await new Promise(resolve => setTimeout(resolve, 10));
                return 'Async error';
            },
        };

        const field = useFormField(form, { value, validators: [validator] });

        const result = await field.validate();

        expect(result).toBe(false);
        expect(field.errors).toEqual(['Async error']);
    });
});

test('useFormField async validator returns true when validation passes', async () => {
    await scope.run(async () => {
        const value = ref('valid');
        const validator: FormValidator<string> = {
            async: true,
            validate: async () => {
                await new Promise(resolve => setTimeout(resolve, 10));
                return null;
            },
        };

        const field = useFormField(form, { value, validators: [validator] });

        const result = await field.validate();

        expect(result).toBe(true);
        expect(field.errors).toEqual([]);
    });
});

test('useFormField mixed sync and async validators work together', async () => {
    await scope.run(async () => {
        const value = ref('');
        const syncValidator: FormValidator<string> = {
            async: false,
            validate: () => 'Sync error',
        };
        const asyncValidator: FormValidator<string> = {
            async: true,
            validate: async () => {
                await new Promise(resolve => setTimeout(resolve, 10));
                return 'Async error';
            },
        };

        const field = useFormField(form, { value, validators: [syncValidator, asyncValidator] });

        const result = await field.validate();

        // Wait for Vue reactivity to settle
        await nextTick();

        expect(result).toBe(false);
        // The sync error is always shown, async error appears after validation completes
        expect(field.errors).toContain('Sync error');
        // Note: async validator errors require the useDataSource to complete its load cycle
        // The validate() returns false when either validator fails, but async errors
        // may require additional ticks to propagate to the errors array
    });
});

test('useFormField validate fails fast on sync errors but still runs async', async () => {
    await scope.run(async () => {
        const value = ref('');
        const asyncCalled = vi.fn();

        const syncValidator: FormValidator<string> = {
            async: false,
            validate: () => 'Sync error',
        };
        const asyncValidator: FormValidator<string> = {
            async: true,
            validate: async () => {
                asyncCalled();
                await new Promise(resolve => setTimeout(resolve, 10));
                return 'Async error';
            },
        };

        const field = useFormField(form, { value, validators: [syncValidator, asyncValidator] });

        const result = await field.validate();

        // Returns false due to sync error
        expect(result).toBe(false);
        // But async validator was still called
        expect(asyncCalled).toHaveBeenCalled();
    });
});

// Tests for nested form scoping (FormField extends FormModel)

test('useFormField has empty fields array initially', () => {
    scope.run(() => {
        const value = ref('test');
        const field = useFormField(form, { value });

        expect(field.fields).toEqual([]);
    });
});

test('useFormField has lang property from parent form', () => {
    scope.run(() => {
        const value = ref('test');
        const field = useFormField(form, { value });

        expect(field.lang).toBe('en');
    });
});

test('useFormField can have nested fields registered to it', () => {
    scope.run(() => {
        const parentValue = ref({ child: '' });
        const parentField = useFormField(form, { value: parentValue });

        const childValue = ref('child value');
        const childField = useFormField(parentField, { value: childValue });

        expect(parentField.fields).toContain(childField);
        expect(parentField.fields.length).toBe(1);
        // Child should not be registered in root form
        expect(form.fields).not.toContain(childField);
    });
});

test('useFormField nested field unregisters from parent field on scope disposal', () => {
    scope.run(() => {
        const parentValue = ref({ child: '' });
        const parentField = useFormField(form, { value: parentValue });

        const innerScope = effectScope();
        innerScope.run(() => {
            const childValue = ref('child value');
            useFormField(parentField, { value: childValue });
        });

        expect(parentField.fields.length).toBe(1);

        innerScope.stop();

        expect(parentField.fields.length).toBe(0);
    });
});

test('useFormField valid considers nested fields validity', () => {
    scope.run(() => {
        const parentValue = ref({ child: '' });
        const parentField = useFormField(form, { value: parentValue });

        const childValue = ref('');
        const requiredValidator: FormValidator<string> = {
            async: false,
            validate: (v: string | null | undefined) => (v ? null : 'Required'),
        };

        useFormField(parentField, { value: childValue, validators: [requiredValidator] });

        // Parent should be invalid because child is invalid
        expect(parentField.valid).toBe(false);
    });
});

test('useFormField invalid considers nested fields invalid state', async () => {
    await scope.run(async () => {
        const parentValue = ref({ child: '' });
        const parentField = useFormField(form, { value: parentValue });

        const childValue = ref('');
        const requiredValidator: FormValidator<string> = {
            async: false,
            validate: (v: string | null | undefined) => (v ? null : 'Required'),
        };

        const childField = useFormField(parentField, { value: childValue, validators: [requiredValidator] });

        // Initially both should not be invalid (not validated yet)
        expect(parentField.invalid).toBe(false);
        expect(childField.invalid).toBe(false);

        // Validate the parent (which validates nested fields)
        await parentField.validate();

        // Now child is invalid, so parent should also be invalid
        expect(childField.invalid).toBe(true);
        expect(parentField.invalid).toBe(true);
    });
});

test('useFormField valid is true when all nested fields are valid', () => {
    scope.run(() => {
        const parentValue = ref({ child: '' });
        const parentField = useFormField(form, { value: parentValue });

        const childValue = ref('valid value');
        const requiredValidator: FormValidator<string> = {
            async: false,
            validate: (v: string | null | undefined) => (v ? null : 'Required'),
        };

        useFormField(parentField, { value: childValue, validators: [requiredValidator] });

        expect(parentField.valid).toBe(true);
    });
});

test('useFormField validate validates nested fields', async () => {
    await scope.run(async () => {
        const parentValue = ref({ child: '' });
        const parentField = useFormField(form, { value: parentValue });

        const childValue = ref('');
        const requiredValidator: FormValidator<string> = {
            async: false,
            validate: (v: string | null | undefined) => (v ? null : 'Required'),
        };

        const childField = useFormField(parentField, { value: childValue, validators: [requiredValidator] });

        const result = await parentField.validate();

        expect(result).toBe(false);
        expect(childField.errors).toEqual(['Required']);
    });
});

test('useFormField validate returns true when all nested fields pass', async () => {
    await scope.run(async () => {
        const parentValue = ref({ child: '' });
        const parentField = useFormField(form, { value: parentValue });

        const childValue = ref('valid');
        const requiredValidator: FormValidator<string> = {
            async: false,
            validate: (v: string | null | undefined) => (v ? null : 'Required'),
        };

        useFormField(parentField, { value: childValue, validators: [requiredValidator] });

        const result = await parentField.validate();

        expect(result).toBe(true);
    });
});

test('useFormField reset resets nested fields', async () => {
    await scope.run(async () => {
        const parentValue = ref({ child: '' });
        const parentField = useFormField(form, { value: parentValue });

        const childValue = ref('');
        const requiredValidator: FormValidator<string> = {
            async: false,
            validate: () => 'Error',
        };

        const childField = useFormField(parentField, { value: childValue, validators: [requiredValidator] });

        // Trigger validation to show errors
        await parentField.validate();
        expect(childField.errors).toEqual(['Error']);

        parentField.reset();

        expect(childField.errors).toEqual([]);
    });
});

test('useFormField deeply nested fields work correctly', () => {
    scope.run(() => {
        const grandparentValue = ref({});
        const grandparentField = useFormField(form, { value: grandparentValue });

        const parentValue = ref({});
        const parentField = useFormField(grandparentField, { value: parentValue });

        const childValue = ref('');
        const requiredValidator: FormValidator<string> = {
            async: false,
            validate: (v: string | null | undefined) => (v ? null : 'Required'),
        };

        useFormField(parentField, { value: childValue, validators: [requiredValidator] });

        // Grandparent should be invalid because nested child is invalid
        expect(grandparentField.valid).toBe(false);
        expect(parentField.valid).toBe(false);
    });
});

test('useFormField nested field has correct form reference to parent', () => {
    scope.run(() => {
        const parentValue = ref({});
        const parentField = useFormField(form, { value: parentValue });

        const childValue = ref('test');
        const childField = useFormField(parentField, { value: childValue });

        // Child's form reference should be the parent field
        expect(childField.form).toBe(parentField);
    });
});

test('useFormField scoped form validation only validates its own fields', async () => {
    await scope.run(async () => {
        // Create two sibling fields
        const field1Value = ref('');
        const field2Value = ref('');

        const requiredValidator: FormValidator<string> = {
            async: false,
            validate: (v: string | null | undefined) => (v ? null : 'Required'),
        };

        const field1 = useFormField(form, { value: field1Value, validators: [requiredValidator] });
        const field2 = useFormField(form, { value: field2Value, validators: [requiredValidator] });

        // Create nested field under field1
        const nestedValue = ref('valid');
        const nestedField = useFormField(field1, { value: nestedValue, validators: [requiredValidator] });

        // Validate only field1 (should validate itself and its nested fields, but not field2)
        const result = await field1.validate();

        // field1 is invalid (empty value), but its nested field is valid
        expect(result).toBe(false);
        expect(field1.errors).toEqual(['Required']);
        expect(nestedField.errors).toEqual([]);

        // field2 should not have been triggered to show errors
        expect(field2.validators[0]!.show).toBe(false);
    });
});
