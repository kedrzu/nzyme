import { h } from 'vue';
import type { FunctionalComponent } from 'vue';

import { defineProps, useProps } from '@nzyme/vue-utils';

import css from './components.module.scss';
import { defineFormField } from './defineFormField.js';

/**
 *
 * @__NO_SIDE_EFFECTS__
 */
export function defineCheckbox() {
    const fieldDef = defineFormField(Boolean);
    const propsDef = defineProps({
        ...fieldDef.props,
        tabindex: Number,
        name: String,
        disabled: Boolean,
    });

    return {
        props: propsDef,
        emits: fieldDef.emits,
        setup,
    };

    function setup() {
        const props = useProps(propsDef);
        const field = fieldDef.create({ props });

        const wrapper: FunctionalComponent = (_, ctx) => {
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
            wrapper,
        };

        function onChange(event: Event) {
            const target = event.target as HTMLInputElement;
            field.value = !!target.checked;
        }
    }
}
