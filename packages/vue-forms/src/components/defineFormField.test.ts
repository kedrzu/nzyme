import { LanguageContext } from '@nzyme/i18n/LanguageContext.js';
import { assert } from '@nzyme/utils/assert.js';
import { createContainer } from '@nzyme/vue-ioc/createContainer.js';
import { injectContext } from '@nzyme/vue-utils/context.js';
import { expect, test } from 'bun:test';
import { createRenderer, defineComponent, h, nextTick, ref } from 'vue';
import type { Component } from 'vue';

import { useForm } from '../useForm.js';
import { useFormField } from '../useFormField.js';
import { useCheckbox } from './useCheckbox.jsx';
import { getRadioGroupEmits, getRadioGroupProps, RadioGroupContext, useRadioGroup } from './useRadioGroup.js';
import { useTextInput } from './useTextInput.jsx';

interface FieldValue {
    value: unknown;
}

let mountedField: FieldValue | undefined;

const CheckboxField = defineComponent({
    props: useCheckbox.props,
    emits: useCheckbox.emits,
    setup() {
        mountedField = useCheckbox().field;
        return () => null;
    },
});

const TextInputField = defineComponent({
    props: useTextInput.props,
    emits: useTextInput.emits,
    setup() {
        mountedField = useTextInput().field;
        return () => null;
    },
});

const RadioGroupField = defineComponent({
    props: getRadioGroupProps<string>(),
    emits: getRadioGroupEmits<string>(),
    setup(props) {
        useRadioGroup(props);
        return () => h(RadioGroupProbe);
    },
});

const RadioGroupProbe = defineComponent({
    setup() {
        mountedField = injectContext(RadioGroupContext).field;
        return () => null;
    },
});

test('a form field bound by modelValue and a listener reports each change once', async () => {
    const cases: [Component, unknown, unknown][] = [
        [CheckboxField, false, true],
        [TextInputField, 'milk', 'bread'],
        [RadioGroupField, 'a', 'b'],
    ];

    for (const [component, initialValue, newValue] of cases) {
        const updates: unknown[] = [];
        const field = mountField(component, () => () => ({
            modelValue: initialValue,
            'onUpdate:modelValue': (value: unknown) => updates.push(value),
        }));

        field.value = newValue;
        await nextTick();

        expect(updates).toEqual([newValue]);
    }
});

test('a form field bound with v-model reports each change once and follows the model', async () => {
    const model = ref<boolean>(false);
    const updates: unknown[] = [];
    const field = mountField(CheckboxField, () => () => ({
        modelValue: model.value,
        'onUpdate:modelValue': (value: boolean) => {
            updates.push(value);
            model.value = value;
        },
    }));

    field.value = true;
    await nextTick();

    expect(updates).toEqual([true]);
    expect(model.value).toBe(true);
    expect(field.value).toBe(true);
});

test('a form field with no model keeps its own value and reports each change once', async () => {
    const updates: unknown[] = [];
    const field = mountField(TextInputField, () => () => ({
        'onUpdate:modelValue': (value: unknown) => updates.push(value),
    }));

    field.value = 'milk';
    await nextTick();

    expect(updates).toEqual(['milk']);
    expect(field.value).toBe('milk');
});

test('a form field bound by field writes to it and reports each change once', async () => {
    const value = ref('');
    const updates: unknown[] = [];
    const field = mountField(TextInputField, () => {
        const formField = useFormField(useForm({}), { value });
        return () => ({
            field: formField,
            'onUpdate:modelValue': (newValue: unknown) => updates.push(newValue),
        });
    });

    field.value = 'milk';
    await nextTick();

    expect(updates).toEqual(['milk']);
    expect(value.value).toBe('milk');

    // The field changes elsewhere, then the user types the earlier value again.
    value.value = '';
    await nextTick();
    field.value = 'milk';
    await nextTick();

    expect(updates).toEqual(['milk', 'milk']);
});

/**
 * Mounts a field component under a parent whose `setup` returns the getter of the field's props.
 */
function mountField(component: Component, setup: () => () => Record<string, unknown>) {
    const { createApp } = createRenderer<object, object>({
        createElement: () => ({}),
        createText: () => ({}),
        createComment: () => ({}),
        setText: () => undefined,
        setElementText: () => undefined,
        insert: () => undefined,
        remove: () => undefined,
        parentNode: () => null,
        nextSibling: () => null,
        patchProp: () => undefined,
    });

    const container = createContainer();
    container.set(LanguageContext, () => 'en');

    const app = createApp({
        setup() {
            const getProps = setup();
            return () => h(component, getProps());
        },
    });
    app.provide(container.injectionKey, container);
    app.mount({});

    const field = mountedField;
    assert(field, 'The field component did not mount');
    mountedField = undefined;

    return field;
}
