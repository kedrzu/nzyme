import { computed, h, reactive } from 'vue';
import type { ExtractPropTypes, FunctionalComponent, PropType } from 'vue';

import type { Primitive } from '@nzyme/types/Common.js';
import { defineProps } from '@nzyme/vue-utils/defineProps.js';
import { injectContext } from '@nzyme/vue-utils/context.js';
import { useEmit } from '@nzyme/vue-utils/useEmit.js';

import type { FormFieldValue } from './defineFormField.js';
import { RadioGroupContext } from './useRadioGroup.js';

/**
 *
 */
export type RadioProps<T extends Primitive = Primitive> = ExtractPropTypes<ReturnType<typeof getRadioProps<T>>>;

/**
 * @__NO_SIDE_EFFECTS__
 */
export function getRadioProps<T extends Primitive = Primitive>() {
    return defineProps({
        value: { type: null as unknown as PropType<T>, required: true },
        tabindex: Number,
        name: String,
        required: Boolean,
        disabled: Boolean,
        readonly: Boolean,
    });
}

/**
 * @__NO_SIDE_EFFECTS__
 */
export function getRadioEmits<T extends Primitive = Primitive>() {
    return {
        selected: undefined as unknown as (value: T) => boolean,
    };
}

/**
 *
 */
export function useRadio<T extends Primitive = Primitive>(props: RadioProps<T>) {
    const ctx = injectContext(RadioGroupContext);
    const emit = useEmit(getRadioEmits<T>());
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

        ctx.field.value = props.value as FormFieldValue<Primitive>;
        emit('selected', props.value as T);
    }
}
