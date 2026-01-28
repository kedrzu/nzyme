import { h } from 'vue';

import { assignProps } from '@nzyme/utils';
import { defineProps, useProps } from '@nzyme/vue-utils';

import { defineFormField } from './defineFormField.js';

const NUMBER_FIELD = defineFormField(Number);

const NUMBER_PROPS = defineProps({
    ...NUMBER_FIELD.props,
    label: String,
    autocomplete: String,
    placeholder: String,
    tabindex: Number,
});

/**
 *
 */
export interface NumberInputAttrs {
    /**
     *
     */
    min?: number;
    /**
     *
     */
    max?: number;
    /**
     *
     */
    step?: number;
}

/**
 *
 */
export const useNumberInput = assignProps(setupNumberInput, {
    props: NUMBER_PROPS,
    emits: NUMBER_FIELD.emits,
});

/**
 * @__NO_SIDE_EFFECTS__
 */
function setupNumberInput() {
    const props = useProps(NUMBER_PROPS);
    const field = NUMBER_FIELD.create({ props });

    return {
        field,
        NumberInput,
    };

    function onInput(event: Event) {
        const target = event.target as HTMLInputElement;
        field.value = Number(target.value);
    }

    function NumberInput(attrs: NumberInputAttrs) {
        return (
            <input
                aria-label={props.label}
                aria-readonly={props.readonly}
                aria-required={props.required}
                autocomplete={props.autocomplete}
                disabled={props.disabled}
                name={props.autocomplete}
                onBlur={field.inputAttrs.onBlur}
                onFocus={field.inputAttrs.onFocus}
                onInput={onInput}
                placeholder={props.placeholder}
                readonly={props.readonly}
                tabindex={props.tabindex}
                title={props.label}
                type="number"
                value={field.value}
                {...attrs}
            />
        );
    }
}
