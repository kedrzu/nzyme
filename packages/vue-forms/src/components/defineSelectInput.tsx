import type { FunctionalComponent } from 'vue';
import { h } from 'vue';

import { defineProps, useProps } from '@nzyme/vue-utils';

import { defineFormField } from './defineFormField.js';

/*#__NO_SIDE_EFFECTS__*/
export function defineSelectInput() {
    const fieldDef = defineFormField(String);
    const propsDef = defineProps({
        ...fieldDef.props,
        type: {
            type: String,
            default: 'text',
        },
        label: String,
        autocomplete: String,
        placeholder: String,
        tabindex: Number,
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

        const component: FunctionalComponent = (_, ctx) => {
            return (
                <select
                    aria-label={props.label}
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
            component,
        };

        function onInput(event: Event) {
            const target = event.target as HTMLSelectElement;
            field.value = target.value;
        }
    }
}
