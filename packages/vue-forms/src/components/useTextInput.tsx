import { h } from 'vue';
import type { InputHTMLAttributes } from 'vue';

import { assignProps } from '@nzyme/utils';
import { defineProps, useEmit, useProps } from '@nzyme/vue-utils';

import { defineFormField } from './defineFormField.js';

const TEXT_INPUT_FIELD = defineFormField(String);
const TEXT_INPUT_PROPS = defineProps({
    ...TEXT_INPUT_FIELD.props,
    label: String,
    name: String,
    autocomplete: String,
    placeholder: String,
    tabindex: Number,
});

const TEXT_INPUT_EMITS = {
    ...TEXT_INPUT_FIELD.emits,
    input: undefined as unknown as (event: Event) => boolean,
    keydown: undefined as unknown as (event: KeyboardEvent) => boolean,
};

/**
 *
 */
export const useTextInput = assignProps(setupTextInput, {
    props: TEXT_INPUT_PROPS,
    emits: TEXT_INPUT_EMITS,
});

/**
 * @__NO_SIDE_EFFECTS__
 */
function setupTextInput() {
    const props = useProps(TEXT_INPUT_PROPS);
    const field = TEXT_INPUT_FIELD.create({ props });
    const emit = useEmit(TEXT_INPUT_EMITS);

    return {
        field,
        TextInput,
    };

    function TextInput(attrs: InputHTMLAttributes) {
        return (
            <input
                {...attrs}
                aria-label={props.label}
                aria-readonly={props.readonly}
                aria-required={props.required}
                autocomplete={props.autocomplete}
                disabled={props.disabled}
                name={props.name ?? props.autocomplete}
                onBlur={field.inputAttrs.onBlur}
                onFocus={field.inputAttrs.onFocus}
                onInput={onInput}
                onKeydown={onKeydown}
                placeholder={props.placeholder}
                readonly={props.readonly}
                tabindex={props.tabindex}
                title={props.label}
                type="text"
                value={field.value}
            />
        );
    }

    function onInput(event: Event) {
        const target = event.target as HTMLInputElement;
        field.value = target.value;
        emit('input', event);
    }

    function onKeydown(event: KeyboardEvent) {
        emit('keydown', event);
    }
}
