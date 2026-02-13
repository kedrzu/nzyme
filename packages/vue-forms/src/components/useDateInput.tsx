import { h, ref } from 'vue';
import type { ButtonHTMLAttributes, InputHTMLAttributes, SetupContext } from 'vue';

import { assignProps } from '@nzyme/utils/assignProps.js';
import { useTranslate } from '@nzyme/vue-i18n/useTranslate.js';
import { defineProps } from '@nzyme/vue-utils/defineProps.js';
import { useProps } from '@nzyme/vue-utils/useProps.js';

import { defineFormField } from './defineFormField.js';
import * as l from './useDateInput.loc.js';

const DATE_FIELD = defineFormField<Date | null>(Date);
const DATE_PROPS = defineProps({
    ...DATE_FIELD.props,
    label: String,
    name: String,
    autocomplete: String,
    placeholder: String,
    tabindex: Number,
    min: Date,
    max: Date,
});

/**
 *
 */
export const useDateInput = assignProps(setupDateInput, {
    props: DATE_PROPS,
    emits: DATE_FIELD.emits,
});

/**
 * @__NO_SIDE_EFFECTS__
 */
function setupDateInput() {
    const props = useProps(DATE_PROPS);
    const field = DATE_FIELD.create({ props });
    const input = ref<HTMLInputElement>();
    const translate = useTranslate();

    return {
        field,
        input,
        DateInput,
        CalendarButton,
        showCalendar,
    };

    function DateInput(attrs: InputHTMLAttributes, ctx: SetupContext) {
        return (
            <input
                aria-label={props.label}
                aria-readonly={props.readonly}
                aria-required={props.required}
                autocomplete={props.autocomplete}
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
                {...attrs}
            />
        );
    }

    function CalendarButton(attrs: ButtonHTMLAttributes, ctx: SetupContext) {
        const slot = ctx.slots.default;

        return (
            <button
                aria-expanded="false"
                aria-haspopup="dialog"
                aria-label={translate(l.showCalendar)}
                onMousedown={showCalendar}
                type="button"
                {...attrs}
            >
                {slot && <slot />}
            </button>
        );
    }

    function onInput(event: Event) {
        const target = event.target as HTMLInputElement;
        field.value = target.valueAsDate ?? null;
    }

    function onFocus(e: FocusEvent) {
        field.inputAttrs.onFocus(e);
        showCalendar();
    }

    function showCalendar() {
        if (props.disabled || props.readonly) {
            return;
        }

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
