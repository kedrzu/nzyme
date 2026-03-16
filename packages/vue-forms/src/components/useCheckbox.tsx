import { h } from 'vue';
import type { FunctionalComponent } from 'vue';

import { assignProps } from '@nzyme/utils/assignProps.js';
import { defineProps } from '@nzyme/vue-utils/defineProps.js';
import { useProps } from '@nzyme/vue-utils/useProps.js';

import { defineFormField } from './defineFormField.js';

const CHECKBOX_FIELD = defineFormField(Boolean);
const CHECKBOX_PROPS = defineProps({
    ...CHECKBOX_FIELD.props,
    tabindex: Number,
    name: String,
});

/** Checkbox composable providing a toggleable boolean form field and its render component. */
export const useCheckbox = assignProps(setupCheckbox, {
    props: CHECKBOX_PROPS,
    emits: CHECKBOX_FIELD.emits,
});

/**
 * @__NO_SIDE_EFFECTS__
 */
function setupCheckbox() {
    const props = useProps(CHECKBOX_PROPS);
    const field = CHECKBOX_FIELD.create({ props });

    const Checkbox: FunctionalComponent = (_props, ctx) => {
        return (
            <button
                aria-checked={!!field.value}
                aria-readonly={props.readonly}
                aria-required={props.required}
                disabled={props.disabled}
                name={props.name}
                onClick={toggle}
                role="checkbox"
                tabindex={props.readonly || props.disabled ? -1 : props.tabindex}
                type="button"
            >
                {ctx.slots.default?.()}
            </button>
        );
    };

    return {
        field,
        Checkbox,
    };

    function toggle(e: MouseEvent) {
        if (props.readonly || props.disabled) {
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        field.value = !field.value;
    }
}
