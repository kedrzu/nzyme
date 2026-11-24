import { assignProps } from '@nzyme/utils/assignProps.js';
import { defineProps } from '@nzyme/vue-utils/defineProps.js';
import { useProps } from '@nzyme/vue-utils/useProps.js';
import { h } from 'vue';
import type { SelectHTMLAttributes, SetupContext } from 'vue';

import { defineFormField } from './defineFormField.js';

const SELECT_FIELD = defineFormField(String);
const SELECT_PROPS = defineProps({
    ...SELECT_FIELD.props,
    label: String,
    autocomplete: String,
    placeholder: String,
    tabindex: Number,
});

/** Select input composable providing a form field and its render component. */
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

    return {
        field,
        SelectInput,
    };

    function SelectInput(attrs: SelectHTMLAttributes, ctx: Pick<SetupContext, 'slots'>) {
        return (
            <select
                {...attrs}
                aria-label={props.label || props.placeholder}
                aria-required={props.required}
                autocomplete={props.autocomplete}
                disabled={props.disabled}
                name={props.autocomplete}
                onBlur={field.inputAttrs.onBlur}
                onFocus={field.inputAttrs.onFocus}
                onInput={onInput}
                placeholder={props.placeholder}
                tabindex={props.tabindex}
                value={field.value}
            >
                {ctx.slots.default?.()}
            </select>
        );
    }

    function onInput(event: Event) {
        const target = event.target as HTMLSelectElement;
        field.value = target.value;
    }
}
