import type { FunctionalComponent } from 'vue';
import { h } from 'vue';

import { assignProps } from '@nzyme/utils';
import { defineProps, useProps } from '@nzyme/vue-utils';

import { defineFormField } from './defineFormField.js';

const SELECT_FIELD = defineFormField(String);
const SELECT_PROPS = defineProps({
    ...SELECT_FIELD.props,
    type: {
        type: String,
        default: 'text',
    },
    label: String,
    autocomplete: String,
    placeholder: String,
    tabindex: Number,
});

/**
 *
 */
export const useSelectInput = assignProps(setupSelectInput, {
    props: SELECT_PROPS,
    emits: SELECT_FIELD.emits,
});

/**
 * @__NO_SIDE_EFFECTS__
 */
function setupSelectInput() {
    const props = useProps(SELECT_PROPS);
    const field = SELECT_FIELD.create({ props });

    const SelectInput: FunctionalComponent = (_, ctx) => {
        return (
            <select
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
                tabindex={props.tabindex}
                title={props.label}
                value={field.value}
            >
                {ctx.slots.default?.()}
            </select>
        );
    };

    return {
        field,
        SelectInput,
    };

    function onInput(event: Event) {
        const target = event.target as HTMLSelectElement;
        field.value = target.value;
    }
}
