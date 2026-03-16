import { h } from 'vue';

import { assignProps } from '@nzyme/utils/assignProps.js';
import { defineProps } from '@nzyme/vue-utils/defineProps.js';
import { useProps } from '@nzyme/vue-utils/useProps.js';

import { defineFormField } from './defineFormField.js';

const NUMBER_FIELD = defineFormField(Number);

const NUMBER_PROPS = defineProps({
    ...NUMBER_FIELD.props,
    label: String,
    autocomplete: String,
    placeholder: String,
    tabindex: Number,
});

/** Additional HTML attributes for the number input element. */
export interface NumberInputAttrs {
    /** Minimum allowed value. */
    min?: number;
    /** Maximum allowed value. */
    max?: number;
    /** Step increment for the input. */
    step?: number;
}

/** Number input composable providing a form field and its render component. */
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
