import { LanguageContext } from '@nzyme/i18n/LanguageContext.js';
import { createContainer } from '@nzyme/vue-ioc/createContainer.js';
import { IocPlugin } from '@nzyme/vue-ioc/IocPlugin.js';
import { describe, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-vue';
import { defineComponent, h } from 'vue';

import { defineValidator } from '../defineValidator.js';
import { useForm } from '../useForm.js';
import { useFormFields } from '../useFormFields.js';
import { defineFormField } from './defineFormField.js';

const PAIR_FIELD = defineFormField<string>();
const INCOMPLETE = 'Enter both parts';

/**
 * A field of two inputs, the way a segmented date is built: both share the field's focus tracking. Its slot holds
 * an addon inside the field that does not carry those handlers, like a date input's calendar button.
 */
const PairField = defineComponent({
    props: PAIR_FIELD.props,
    emits: PAIR_FIELD.emits,
    setup(props, { slots }) {
        const field = PAIR_FIELD.create({ props });

        return () =>
            h('div', [
                h('input', { 'aria-label': 'First', ...field.inputAttrs, onInput: setPart(0) }),
                h('input', { 'aria-label': 'Second', ...field.inputAttrs, onInput: setPart(1) }),
                slots.default?.(),
                h('p', { role: 'alert' }, field.errors[0]),
            ]);

        function setPart(index: number) {
            return (event: Event) => {
                const parts = (field.value ?? '').split('/');
                parts[index] = (event.target as HTMLInputElement).value;
                field.value = parts.join('/');
            };
        }
    },
});

describe('defineFormField', () => {
    test('moving focus between the inputs of one field does not reveal its error', async () => {
        await renderPairField();

        await userEvent.click(page.getByRole('textbox', { name: 'First' }));
        await userEvent.keyboard('12');
        await userEvent.tab();

        await expect.element(page.getByRole('textbox', { name: 'Second' })).toHaveFocus();
        await expect.element(page.getByRole('alert')).toBeEmptyDOMElement();
    });

    test('leaving the field reveals its error', async () => {
        await renderPairField();

        await userEvent.click(page.getByRole('textbox', { name: 'First' }));
        await userEvent.keyboard('12');
        await userEvent.tab();
        await userEvent.tab();

        await expect.element(page.getByRole('alert')).toHaveTextContent(INCOMPLETE);
    });

    test('moving focus between the inputs of one field emits neither blur nor focus', async () => {
        const events: string[] = [];
        await renderPairField({ events });

        await userEvent.click(page.getByRole('textbox', { name: 'First' }));
        await userEvent.tab();
        await userEvent.tab({ shift: true });
        await userEvent.tab();
        await expect.element(page.getByRole('textbox', { name: 'Second' })).toHaveFocus();

        await userEvent.tab();
        await expect.poll(() => events).toEqual(['focus', 'blur']);
    });

    test('focus passing through a button inside the field leaves it and enters it again', async () => {
        const events: string[] = [];
        await renderPairField({ events, addon: true });

        await userEvent.click(page.getByRole('textbox', { name: 'Second' }));
        await userEvent.keyboard('12');
        await userEvent.tab();
        await expect.element(page.getByRole('button', { name: 'Clear' })).toHaveFocus();
        await expect.element(page.getByRole('alert')).toHaveTextContent(INCOMPLETE);
        await expect.poll(() => events).toEqual(['focus', 'blur']);

        await userEvent.tab({ shift: true });
        await expect.poll(() => events).toEqual(['focus', 'blur', 'focus']);

        await userEvent.tab();
        await userEvent.tab();
        await expect.element(page.getByRole('button', { name: 'Next' })).toHaveFocus();
        await expect.poll(() => events).toEqual(['focus', 'blur', 'focus', 'blur']);
    });
});

async function renderPairField(options: { events?: string[]; addon?: boolean } = {}) {
    const container = createContainer();
    container.set(LanguageContext, () => 'en');

    const App = defineComponent({
        setup() {
            const form = useForm({ pair: '/' });
            const fields = useFormFields(form, {
                pair: [
                    defineValidator<string>({
                        validate: value => (value?.split('/').some(part => !part) ? INCOMPLETE : undefined),
                    }),
                ],
            });

            return () =>
                h('div', [
                    h(
                        PairField,
                        {
                            field: fields.pair,
                            onFocus: () => options.events?.push('focus'),
                            onBlur: () => options.events?.push('blur'),
                        },
                        options.addon ? () => h('button', { type: 'button' }, 'Clear') : undefined,
                    ),
                    h('button', 'Next'),
                ]);
        },
    });

    return render(App, { global: { plugins: [[IocPlugin, { container }]] } });
}
