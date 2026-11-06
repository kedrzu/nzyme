import { LanguageContext } from '@nzyme/i18n/LanguageContext.js';
import { createEventEmitter } from '@nzyme/utils/createEventEmitter.js';
import type { EventEmitterAny } from '@nzyme/utils/createEventEmitter.js';
import { createContainer } from '@nzyme/vue-ioc/createContainer.js';
import { IocPlugin } from '@nzyme/vue-ioc/IocPlugin.js';
import { afterEach, describe, expect, test } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-vue';
import { defineComponent, h } from 'vue';

import { useForm } from '../useForm.js';
import { useFormFields } from '../useFormFields.js';
import Form from './Form.vue';
import { useTextInput } from './useTextInput.jsx';

const PENDING_CLASS = 'is-pending';

/** A text input built on `useTextInput`, the way an app's input component is. */
const TextInputField = defineComponent({
    props: useTextInput.props,
    emits: useTextInput.emits,
    setup() {
        const { TextInput } = useTextInput();
        return () => h(TextInput);
    },
});

interface RenderFormOptions {
    submitTrigger?: boolean;
    submitEvent?: EventEmitterAny;
    /** What the `submit` listener returns; a pending promise keeps the form pending. */
    onSubmit?: (name: string) => Promise<void> | void;
}

/** Native `submit` events seen after the form handled them, to tell whether the default was prevented. */
const nativeSubmits: SubmitEvent[] = [];
const recordNativeSubmit = (event: SubmitEvent) => nativeSubmits.push(event);
document.addEventListener('submit', recordNativeSubmit);

afterEach(() => {
    nativeSubmits.length = 0;
});

describe('Form', () => {
    test('submits with the field values when Enter is pressed in a field, and prevents the native submit', async () => {
        const { submits } = await renderForm();

        await userEvent.type(page.getByRole('textbox', { name: 'Name' }), 'Ada{Enter}');

        await expect.poll(() => submits).toEqual(['Ada']);
        expect(nativeSubmits).toHaveLength(1);
        expect(nativeSubmits[0]!.defaultPrevented).toBe(true);
    });

    test('keeps the input that makes Enter submit out of sight and out of the tab order', async () => {
        const { form } = await renderForm();
        const submitInput = form().querySelector('input[type="submit"]');

        expect(submitInput).toBeInstanceOf(HTMLInputElement);
        await expect.element(submitInput as HTMLInputElement).not.toBeVisible();
        expect((submitInput as HTMLInputElement).tabIndex).toBe(-1);
    });

    test('submits when `submitTrigger` turns true', async () => {
        const { submits, screen } = await renderForm({ submitTrigger: false });
        expect(submits).toEqual([]);

        await screen.rerender({ submitTrigger: true });

        await expect.poll(() => submits).toHaveLength(1);
    });

    test('submits when `submitEvent` is emitted', async () => {
        const submitRequest = createEventEmitter();
        const { submits } = await renderForm({ submitEvent: submitRequest.event });
        expect(submits).toEqual([]);

        submitRequest.emit();

        await expect.poll(() => submits).toHaveLength(1);
    });

    test('while submitting, is inert, has `pendingClass` and gives the slot `pending`', async () => {
        let finish = () => {};
        const { form } = await renderForm({
            onSubmit: () =>
                new Promise<void>(resolve => {
                    finish = resolve;
                }),
        });
        expect(form().inert).toBe(false);
        expect(form().classList.contains(PENDING_CLASS)).toBe(false);
        await expect.element(page.getByTestId('pending')).toHaveTextContent('idle');

        await page.getByRole('button', { name: 'Send' }).click();

        await expect.element(page.getByTestId('pending')).toHaveTextContent('pending');
        expect(form().inert).toBe(true);
        expect(form().classList.contains(PENDING_CLASS)).toBe(true);

        finish();

        await expect.element(page.getByTestId('pending')).toHaveTextContent('idle');
        expect(form().inert).toBe(false);
        expect(form().classList.contains(PENDING_CLASS)).toBe(false);
    });

    test('the slot `submit` submits the form', async () => {
        const { submits } = await renderForm();

        await userEvent.type(page.getByRole('textbox', { name: 'Name' }), 'Grace');
        await page.getByRole('button', { name: 'Send' }).click();

        await expect.poll(() => submits).toEqual(['Grace']);
        // The button is not a submit button: the form submitted through the slot, not natively.
        expect(nativeSubmits).toHaveLength(0);
    });

    test('skips the browser validation of its inputs', async () => {
        const { form, submits } = await renderForm();
        expect(form().noValidate).toBe(true);

        // The empty `required` input would make the browser refuse to submit.
        await userEvent.type(page.getByRole('textbox', { name: 'Name' }), '{Enter}');

        await expect.poll(() => submits).toEqual(['']);
    });
});

async function renderForm(options: RenderFormOptions = {}) {
    const submits: string[] = [];

    const Host = defineComponent({
        props: { submitTrigger: Boolean },
        setup(props) {
            const model = useForm({ name: '' });
            const fields = useFormFields(model, { name: [] });

            return () =>
                h(
                    Form,
                    {
                        pendingClass: PENDING_CLASS,
                        submitTrigger: props.submitTrigger,
                        submitEvent: options.submitEvent,
                        onSubmit: () => {
                            submits.push(model.value.name);
                            return options.onSubmit?.(model.value.name);
                        },
                    },
                    {
                        default: ({ pending, submit }: { pending: boolean; submit: () => Promise<void> }) => [
                            h(TextInputField, { field: fields.name, label: 'Name' }),
                            h('input', { required: true, 'aria-label': 'Required' }),
                            h('span', { 'data-testid': 'pending' }, pending ? 'pending' : 'idle'),
                            h('button', { type: 'button', onClick: () => void submit() }, 'Send'),
                        ],
                    },
                );
        },
    });

    // Fields resolve their services (the language of validation messages) from the app's container.
    const container = createContainer();
    container.set(LanguageContext, () => 'en');

    const screen = await render(Host, {
        global: { plugins: [[IocPlugin, { container }]] },
        props: { submitTrigger: options.submitTrigger ?? false },
    });

    return {
        screen,
        submits,
        form: () => screen.container.querySelector('form')!,
    };
}
