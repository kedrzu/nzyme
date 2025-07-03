import { h } from 'vue';
import type { FunctionalComponent } from 'vue';

import { assignProps } from '@nzyme/utils';
import { defineProps, useProps } from '@nzyme/vue-utils';

import { defineFormField } from './defineFormField.js';

const CHECKBOX_FIELD = defineFormField(Boolean);
const CHECKBOX_PROPS = defineProps({
    ...CHECKBOX_FIELD.props,
    tabindex: Number,
    name: String,
});

/**
 *
 */
export const useCheckbox = assignProps(setupCheckbox, {
    props: CHECKBOX_PROPS,
    emits: CHECKBOX_FIELD.emits,
});

/**
 *
 * @__NO_SIDE_EFFECTS__
 */
function setupCheckbox() {
    const props = useProps(CHECKBOX_PROPS);
    const field = CHECKBOX_FIELD.create({ props });

    const CheckboxRoot: FunctionalComponent = (_props, ctx) => {
        return <label>{ctx.slots.default?.()}</label>;
    };

    const CheckboxTick: FunctionalComponent = (_props, ctx) => {
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
        CheckboxRoot,
        CheckboxTick,
    };

    function toggle() {
        if (props.readonly || props.disabled) {
            return;
        }

        console.log('toggle', field.value);

        field.value = !field.value;
    }
}
