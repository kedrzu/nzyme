import { assignProps } from '@nzyme/utils/assignProps.js';
import { defineProps } from '@nzyme/vue-utils/defineProps.js';
import { useProps } from '@nzyme/vue-utils/useProps.js';
import { h } from 'vue';
import type { ButtonHTMLAttributes, SetupContext } from 'vue';

import { defineFormField } from './defineFormField.js';

const CHECKBOX_FIELD = defineFormField(Boolean);
const CHECKBOX_PROPS = defineProps({
    ...CHECKBOX_FIELD.props,
    tabindex: Number,
    name: String,
    /**
     * Mixed state, rendered as `aria-checked="mixed"` while the value is not `true`. A click checks it.
     */
    indeterminate: Boolean,
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

    return {
        field,
        Checkbox,
    };

    function Checkbox(attrs: ButtonHTMLAttributes, ctx: Pick<SetupContext, 'slots'>) {
        return (
            <button
                {...attrs}
                aria-checked={field.value ? true : props.indeterminate ? 'mixed' : false}
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
    }

    function toggle(e: MouseEvent) {
        if (props.readonly || props.disabled) {
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        field.value = !field.value;
    }
}
