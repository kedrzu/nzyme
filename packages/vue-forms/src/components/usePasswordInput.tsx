import { computed, h, nextTick, reactive, ref } from 'vue';
import type { ButtonHTMLAttributes, SetupContext } from 'vue';

import { assignProps } from '@nzyme/utils';
import { defineProps, useProps } from '@nzyme/vue-utils';

import { defineFormField } from './defineFormField.js';

const PASSWORD_FIELD = defineFormField(String);
const PASSWORD_PROPS = defineProps({
    ...PASSWORD_FIELD.props,
    label: String,
    placeholder: String,
    tabindex: Number,
});

/**
 *
 */
export const usePasswordInput = assignProps(setupPasswordInput, {
    props: PASSWORD_PROPS,
    emits: PASSWORD_FIELD.emits,
});

/**
 *
 * @__NO_SIDE_EFFECTS__
 */
function setupPasswordInput() {
    const props = useProps(PASSWORD_PROPS);
    const field = PASSWORD_FIELD.create({ props });

    const inputEl = ref<HTMLInputElement | null>(null);
    const showPassword = ref(false);
    const inputType = computed(() => (showPassword.value ? 'text' : 'password'));

    return reactive({
        field,
        showPassword,
        togglePassword,
        component,
        showPasswordButton,
    });

    function component() {
        return (
            <input
                aria-label={props.label}
                aria-readonly={props.readonly}
                aria-required={props.required}
                autocomplete="off"
                disabled={props.disabled}
                name="password"
                onBlur={field.inputAttrs.onBlur}
                onFocus={field.inputAttrs.onFocus}
                onInput={onInput}
                placeholder={props.placeholder}
                readonly={props.readonly}
                ref={inputEl}
                tabindex={props.tabindex}
                title={props.label}
                type={inputType.value}
                value={field.value}
            />
        );
    }

    function showPasswordButton(attrs: ButtonHTMLAttributes, ctx: SetupContext) {
        return (
            <button
                {...attrs}
                onClick={togglePassword}
                tabindex="-1"
                type="button"
            >
                {ctx.slots.default?.()}
            </button>
        );
    }

    function togglePassword(): void;
    function togglePassword(show: boolean): void;
    function togglePassword(show?: boolean): void {
        if (typeof show === 'boolean') {
            showPassword.value = show;
        } else {
            showPassword.value = !showPassword.value;
        }

        // Focus the input after showing / hiding the password.
        void nextTick(() => inputEl.value?.focus());
    }

    function onInput(event: Event) {
        const target = event.target as HTMLInputElement;
        field.value = target.value;
    }
}
