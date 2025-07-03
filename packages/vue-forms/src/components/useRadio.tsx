import { computed, h, reactive } from 'vue';
import type { FunctionalComponent } from 'vue';

import type { Primitive } from '@nzyme/types';
import { assignProps } from '@nzyme/utils';
import { defineProp, defineProps, useEmit, useProps } from '@nzyme/vue-utils';

import css from './components.module.scss';
import { defineFormField } from './defineFormField.js';

const RADIO_FIELD = defineFormField<Primitive>();

const RADIO_PROPS = defineProps({
    ...RADIO_FIELD.props,
    option: defineProp<Primitive>({ required: true }),
    tabindex: Number,
    name: String,
});

const RADIO_EMITS = {
    ...RADIO_FIELD.emits,
    selected: undefined as unknown as (value: Primitive) => boolean,
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
function setupRadio<T extends Primitive | null = Primitive | null>() {
    const props = useProps(RADIO_PROPS);
    const emit = useEmit(RADIO_EMITS);
    const field = RADIO_FIELD.create({ props });
    const selected = computed(() => field.value === props.option);

    const wrapper: FunctionalComponent = (_, ctx) => {
        return (
            <label>
                <input
                    aria-readonly={props.readonly}
                    aria-required={props.required}
                    checked={selected.value}
                    class={css.hiddenInput}
                    disabled={props.disabled}
                    name={props.name}
                    onChange={onChange}
                    tabindex={props.tabindex}
                    type="radio"
                    value={props.modelValue}
                />
                {ctx.slots.default?.()}
            </label>
        );
    };

    return reactive({
        field,
        wrapper,
        selected,
    });

    function onChange(event: Event) {
        const target = event.target as HTMLInputElement;
        if (target.checked) {
            field.value = props.option as T;
            emit('selected', props.option);
        }
    }
}
