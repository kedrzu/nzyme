import { h } from 'vue';

import { assignProps } from '@nzyme/utils';
import { defineProps, useProps } from '@nzyme/vue-utils';

import { defineFormField } from './defineFormField.js';

const TEXT_INPUT_FIELD = defineFormField(String);
const TEXT_INPUT_PROPS = defineProps({
    ...TEXT_INPUT_FIELD.props,
    label: String,
    name: String,
    autocomplete: String,
    placeholder: String,
    tabindex: Number,
    /** Trims the input text. Enabled by default. */
    trim: {
        type: Boolean,
        default: true,
    },
    disabled: Boolean,
    readonly: Boolean,
});

/**
 *
 */
export const useTextInput = assignProps(setupTextInput, {
    props: TEXT_INPUT_PROPS,
    emits: TEXT_INPUT_FIELD.emits,
});

/**
 *
 * @__NO_SIDE_EFFECTS__
 */
function setupTextInput() {
    const props = useProps(TEXT_INPUT_PROPS);
    const field = TEXT_INPUT_FIELD.create({ props });

    return {
        field,
        component,
    };

    function onInput(event: Event) {
        const target = event.target as HTMLInputElement;
        const value = props.trim ? target.value.trim() : target.value;
        field.value = value;
    }

    function component() {
        return (
            <input
                aria-label={props.label}
                autocomplete={props.autocomplete}
                disabled={props.disabled}
                name={props.name ?? props.autocomplete}
                onBlur={field.inputAttrs.onBlur}
                onFocus={field.inputAttrs.onFocus}
                onInput={onInput}
                placeholder={props.placeholder}
                readonly={props.readonly}
                tabindex={props.tabindex}
                title={props.label}
                type="text"
                value={field.value}
            />
        );
    }
}
