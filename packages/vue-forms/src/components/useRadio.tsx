import { computed, h, reactive } from 'vue';
import type { FunctionalComponent } from 'vue';

import { assignProps } from '@nzyme/utils';
import { defineProp, defineProps, injectContext, useEmit, useProps } from '@nzyme/vue-utils';

import { RadioGroupContext } from './useRadioGroup.js';

const RADIO_PROPS = defineProps({
    value: defineProp<string>({ required: true }),
    tabindex: Number,
    name: String,
    required: Boolean,
    disabled: Boolean,
    readonly: Boolean,
});

const RADIO_EMITS = {
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
    const ctx = injectContext(RadioGroupContext);
    const emit = useEmit(RADIO_EMITS);
    const selected = computed(() => ctx.field.value === props.value);
    const readonly = computed(() => props.readonly || ctx.props.readonly);
    const disabled = computed(() => props.disabled || ctx.props.disabled);
    const required = computed(() => props.required || ctx.props.required);

    const state = reactive({
        selected,
        readonly,
        disabled,
        required,
    });

    const Radio: FunctionalComponent = (_, { slots }) => {
        return (
            <button
                aria-checked={selected.value}
                aria-readonly={readonly.value}
                aria-required={required.value}
                disabled={disabled.value}
                name={props.name}
                onClick={onClick}
                role="radio"
                tabindex={state.readonly || state.disabled ? -1 : props.tabindex}
                type="button"
            >
                {slots.default?.()}
            </button>
        );
    };

    return {
        field: ctx.field,
        state,
        Radio,
    };

    function onClick() {
        if (state.readonly || state.disabled) {
            return;
        }

        ctx.field.value = props.value;
        emit('selected', props.value);
    }
}
