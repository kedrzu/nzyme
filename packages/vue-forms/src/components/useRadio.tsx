import type { Primitive } from '@nzyme/types/Common.js';
import { assertValue } from '@nzyme/utils/assert.js';
import { injectContext } from '@nzyme/vue-utils/context.js';
import { defineProps } from '@nzyme/vue-utils/defineProps.js';
import { useEmit } from '@nzyme/vue-utils/useEmit.js';
import { computed, h, onScopeDispose, reactive, ref, toRef } from 'vue';
import type { ButtonHTMLAttributes, ExtractPropTypes, PropType, SetupContext } from 'vue';

import type { FormFieldValue } from './defineFormField.js';
import { RadioGroupContext } from './useRadioGroup.js';

/** Extracted prop types for a radio button component. */
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
 * Radio button composable that integrates with a RadioGroup context for selection state. Follows the
 * WAI-ARIA radio group pattern: only one radio of the group is in the tab order, and the arrow keys move
 * focus and selection to the previous or next enabled radio, wrapping around. A readonly radio stays
 * focusable and the arrow keys still move focus, but nothing changes the selection.
 */
export function useRadio<T extends Primitive = Primitive>(props: RadioProps<T>) {
    const ctx = injectContext(RadioGroupContext);
    const emit = useEmit(getRadioEmits<T>());
    const element = ref<HTMLElement | null>(null);
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

    const item = reactive({
        value: toRef(props, 'value'),
        disabled,
        element,
        select,
    });

    ctx.radios.push(item);
    onScopeDispose(() => {
        ctx.radios.splice(ctx.radios.indexOf(item), 1);
    });

    return {
        field: ctx.field,
        state,
        Radio,
    };

    function Radio(attrs: ButtonHTMLAttributes, { slots }: Pick<SetupContext, 'slots'>) {
        return (
            <button
                {...attrs}
                aria-checked={selected.value}
                aria-required={required.value}
                disabled={disabled.value}
                name={props.name}
                onBlur={ctx.onBlur}
                onClick={onClick}
                onFocus={ctx.onFocus}
                onKeydown={onKeydown}
                ref={element}
                role="radio"
                tabindex={ctx.tabStop.value !== item ? -1 : (props.tabindex ?? 0)}
                type="button"
            >
                {slots.default?.()}
            </button>
        );
    }

    function onClick() {
        if (state.readonly || state.disabled) {
            return;
        }

        select();
    }

    function onKeydown(event: KeyboardEvent) {
        if (state.disabled) {
            return;
        }

        let step: number;
        switch (event.key) {
            case 'ArrowDown':
            case 'ArrowRight':
                step = 1;
                break;
            case 'ArrowUp':
            case 'ArrowLeft':
                step = -1;
                break;
            default:
                return;
        }

        event.preventDefault();

        const radios = ctx.getEnabledRadios();
        const next = assertValue(radios[(radios.indexOf(item) + step + radios.length) % radios.length]);
        if (!state.readonly) {
            next.select();
        }

        next.element?.focus();
    }

    function select() {
        ctx.field.value = props.value as FormFieldValue<Primitive>;
        emit('selected', props.value);
    }
}
