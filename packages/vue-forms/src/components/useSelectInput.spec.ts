import { LanguageContext } from '@nzyme/i18n/LanguageContext.js';
import { createContainer } from '@nzyme/vue-ioc/createContainer.js';
import { IocPlugin } from '@nzyme/vue-ioc/IocPlugin.js';
import { describe, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-vue';
import { defineComponent, h } from 'vue';

import { useSelectInput } from './useSelectInput.jsx';

/** A select built on `useSelectInput`, passing its fallthrough attributes to the `<select>`. */
const SelectField = defineComponent({
    inheritAttrs: false,
    props: useSelectInput.props,
    emits: useSelectInput.emits,
    setup(_, { attrs }) {
        const { SelectInput } = useSelectInput();
        return () => h(SelectInput, attrs, () => [h('option', { value: 'a' }, 'A'), h('option', { value: 'b' }, 'B')]);
    },
});

describe('useSelectInput', () => {
    test('is named by its label prop when no labelledby is given', async () => {
        await renderSelect({ label: 'Colour' });

        await expect.element(page.getByRole('combobox', { name: 'Colour' })).toBeInTheDocument();
    });

    test('is named by the element referenced in aria-labelledby, over the label prop', async () => {
        await renderSelect({ label: 'Anything else?', 'aria-labelledby': 'select-label' });

        await expect.element(page.getByRole('combobox', { name: 'Anything else? (optional)' })).toBeInTheDocument();
    });

    test('forwards id, aria-describedby and aria-invalid to the select', async () => {
        await renderSelect({
            label: 'Colour',
            id: 'colour',
            'aria-describedby': 'select-error',
            'aria-invalid': 'true',
        });

        const select = page.getByRole('combobox', { name: 'Colour' });
        await expect.element(select).toHaveAttribute('id', 'colour');
        await expect.element(select).toHaveAccessibleDescription('Pick a colour');
        await expect.element(select).toBeInvalid();
    });
});

async function renderSelect(attrs: Record<string, unknown>) {
    const Host = defineComponent({
        setup() {
            return () => [
                h('span', { id: 'select-label' }, 'Anything else? (optional)'),
                h('span', { id: 'select-error' }, 'Pick a colour'),
                h(SelectField, attrs),
            ];
        },
    });

    // Fields resolve their services (the language of validation messages) from the app's container.
    const container = createContainer();
    container.set(LanguageContext, () => 'en');

    return await render(Host, { global: { plugins: [[IocPlugin, { container }]] } });
}
