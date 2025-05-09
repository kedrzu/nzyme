import { computed, h, nextTick, reactive, ref } from 'vue';
import type { ButtonHTMLAttributes, SetupContext } from 'vue';

import { defineProps, useProps } from '@nzyme/vue-utils';

import { defineFormField } from './defineFormField.js';

/**
 *
 * @__NO_SIDE_EFFECTS__
 */
export function definePasswordInput() {
    const fieldDef = defineFormField(String);
    const propsDef = defineProps({
        ...fieldDef.props,
        label: String,
        placeholder: String,
        tabindex: Number,
        disabled: Boolean,
    });

    return {
        props: propsDef,
        emits: fieldDef.emits,
        setup,
    };

    function setup() {
        const props = useProps(propsDef);
        const field = fieldDef.create({ props });

        const input = ref<HTMLInputElement | null>(null);
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
                    autocomplete="off"
                    disabled={props.disabled}
                    name="password"
                    onBlur={field.inputAttrs.onBlur}
                    onFocus={field.inputAttrs.onFocus}
                    onInput={onInput}
                    placeholder={props.placeholder}
                    ref={input}
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
            void nextTick(() => input.value?.focus());
        }

        function onInput(event: Event) {
            const target = event.target as HTMLInputElement;
            field.value = target.value;
        }
    }
}
