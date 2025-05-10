import { h, ref } from 'vue';

import { assignProps } from '@nzyme/utils';
import { defineProps, useProps } from '@nzyme/vue-utils';

import { defineFormField } from './defineFormField.js';

const DATE_FIELD = defineFormField<Date>(Date);
const DATE_PROPS = defineProps({
    ...DATE_FIELD.props,
    label: String,
    name: String,
    placeholder: String,
    tabindex: Number,
    disabled: Boolean,
    readonly: Boolean,
    min: Date,
    max: Date,
});

/**
 *
 * @__PURE__
 */
export const useDateInput = assignProps(setupDateInput, {
    props: DATE_PROPS,
    emits: DATE_FIELD.emits,
});

/**
 *
 * @__NO_SIDE_EFFECTS__
 */
function setupDateInput() {
    const props = useProps(DATE_PROPS);
    const field = DATE_FIELD.create({ props });
    const input = ref<HTMLInputElement>();

    return {
        field,
        input,
        component,
        showCalendar,
    };

    function onInput(event: Event) {
        const target = event.target as HTMLInputElement;
        field.value = target.valueAsDate ?? null;
    }

    function onFocus(e: FocusEvent) {
        field.inputAttrs.onFocus(e);
        showCalendar();
    }

    function component() {
        return (
            <input
                aria-label={props.label}
                disabled={props.disabled}
                max={formatDate(props.max)}
                min={formatDate(props.min)}
                name={props.name}
                onBlur={field.inputAttrs.onBlur}
                onFocus={onFocus}
                onInput={onInput}
                placeholder={props.placeholder}
                readonly={props.readonly}
                ref={input}
                tabindex={props.tabindex}
                title={props.label}
                type="date"
                value={formatDate(field.value)}
            />
        );
    }

    function showCalendar() {
        input.value?.showPicker();
    }

    function formatDate(date: Date | null | undefined) {
        if (!date) {
            return undefined;
        }

        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        return `${year}-${month}-${day}`;
    }
}
