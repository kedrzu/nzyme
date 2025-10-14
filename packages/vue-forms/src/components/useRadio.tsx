import { computed, h } from 'vue';
import type { FunctionalComponent } from 'vue';

import { assignProps } from '@nzyme/utils';
import { defineProp, defineProps, useEmit, useProps } from '@nzyme/vue-utils';

import { defineFormField } from './defineFormField.js';

const RADIO_FIELD = defineFormField<string>();

const RADIO_PROPS = defineProps({
    ...RADIO_FIELD.props,
    option: defineProp<string>({ required: true }),
    tabindex: Number,
    name: String,
});

const RADIO_EMITS = {
    ...RADIO_FIELD.emits,
    selected: undefined as unknown as (value: string) => boolean,
};

/**
 *
 */
export const useRadio = assignProps(setupRadio, {
    props: RADIO_PROPS,
    emits: RADIO_EMITS,
});

/**
 *
 * @__NO_SIDE_EFFECTS__
 */
function setupRadio() {
    const props = useProps(RADIO_PROPS);
    const emit = useEmit(RADIO_EMITS);
    const field = RADIO_FIELD.create({ props });
    const selected = computed(() => field.value === props.option);

    const Radio: FunctionalComponent = (_, ctx) => {
        return (
            <button
                aria-checked={selected.value}
                aria-readonly={props.readonly}
                aria-required={props.required}
                disabled={props.disabled}
                name={props.name}
                onClick={onClick}
                role="radio"
                tabindex={props.readonly || props.disabled ? -1 : props.tabindex}
                type="button"
            >
                {ctx.slots.default?.()}
            </button>
        );
    };

    return {
        field,
        selected,
        Radio,
    };

    function onClick() {
        if (props.readonly || props.disabled) {
            return;
        }

        field.value = props.option;
        emit('selected', props.option);
    }
}
