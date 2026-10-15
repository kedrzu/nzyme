import { expect, test } from 'bun:test';
import { createSSRApp, defineComponent, h } from 'vue';
import { renderToString } from 'vue/server-renderer';

import { useCheckbox } from './useCheckbox.jsx';

test('useCheckbox passes attributes through to the button', async () => {
    const html = await renderCheckbox(
        {},
        {
            id: 'milk',
            class: 'check',
            'aria-label': 'Milk',
            'aria-describedby': 'milk-errors',
            'aria-invalid': true,
            'data-tid': 'milk-check',
        },
    );

    expect(html).toContain('id="milk"');
    expect(html).toContain('class="check"');
    expect(html).toContain('aria-label="Milk"');
    expect(html).toContain('aria-describedby="milk-errors"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('data-tid="milk-check"');
});

test('useCheckbox renders the indeterminate state as mixed until it is checked', async () => {
    expect(await renderCheckbox({ indeterminate: true, modelValue: false })).toContain('aria-checked="mixed"');
    expect(await renderCheckbox({ indeterminate: true, modelValue: true })).toContain('aria-checked="true"');
    expect(await renderCheckbox({ modelValue: false })).toContain('aria-checked="false"');
});

async function renderCheckbox(props: { indeterminate?: boolean; modelValue?: boolean }, attrs = {}) {
    const CheckboxField = defineComponent({
        props: useCheckbox.props,
        emits: useCheckbox.emits,
        setup() {
            const { Checkbox } = useCheckbox();
            return () => h(Checkbox, attrs);
        },
    });

    return await renderToString(createSSRApp({ render: () => h(CheckboxField, props) }));
}
