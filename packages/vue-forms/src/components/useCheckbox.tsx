import { h } from 'vue';
import type { FunctionalComponent } from 'vue';

import { assignProps } from '@nzyme/utils';
import { defineProps, useProps } from '@nzyme/vue-utils';

import css from './components.module.scss';
import { defineFormField } from './defineFormField.js';

const CHECKBOX_FIELD = defineFormField(Boolean);
const CHECKBOX_PROPS = defineProps({
    ...CHECKBOX_FIELD.props,
    tabindex: Number,
    name: String,
    disabled: Boolean,
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

    const component: FunctionalComponent = (_, ctx) => {
        return (
            <label>
                <input
                    checked={!!field.value}
                    class={css.hiddenInput}
                    disabled={props.disabled}
                    name={props.name}
                    onChange={onChange}
                    tabindex={props.tabindex}
                    type="checkbox"
                />
                {ctx.slots.default?.()}
            </label>
        );
    };

    return {
        field,
        component,
    };

    function onChange(event: Event) {
        const target = event.target as HTMLInputElement;
        field.value = !!target.checked;
    }
}
