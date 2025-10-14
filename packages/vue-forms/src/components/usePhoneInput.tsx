import type { AsYouType, CountryCode } from 'libphonenumber-js';
import { h, onMounted, ref, watch } from 'vue';
import type { PropType } from 'vue';

import { assignProps, isDigit } from '@nzyme/utils';
import { defineProps, useProps } from '@nzyme/vue-utils';

import { defineFormField } from './defineFormField.js';

const PHONE_FIELD = defineFormField(String);
const PHONE_PROPS = defineProps({
    ...PHONE_FIELD.props,
    type: {
        type: String,
        default: 'text',
    },
    country: String as PropType<CountryCode>,
    name: String,
    label: String,
    placeholder: String,
    tabindex: Number,
    disabled: Boolean,
    readonly: Boolean,
});

/**
 *
 */
export const usePhoneInput = assignProps(setupPhoneInput, {
    props: PHONE_PROPS,
    emits: PHONE_FIELD.emits,
});

/**
 *
 * @__NO_SIDE_EFFECTS__
 */
function setupPhoneInput() {
    const props = useProps(PHONE_PROPS);
    const field = PHONE_FIELD.create({ props });

    const inputElement = ref<HTMLInputElement | null>(null);

    let formatter: AsYouType | undefined;

    watch(inputElement, () => updatePhone());

    watch(
        () => field.value,
        value => updatePhone(value ?? ''),
    );

    onMounted(initFormatter);
    watch(() => props.country, initFormatter);

    return {
        field,
        PhoneInput,
    };

    function PhoneInput() {
        return (
            <input
                aria-label={props.label}
                aria-readonly={props.readonly}
                aria-required={props.required}
                autocomplete="tel"
                disabled={props.disabled}
                name={props.name ?? 'tel'}
                onBlur={field.inputAttrs.onBlur}
                onFocus={field.inputAttrs.onFocus}
                onInput={onInput}
                placeholder={props.placeholder}
                readonly={props.readonly}
                ref={inputElement}
                tabindex={props.tabindex}
                title={props.label}
                type="tel"
            />
        );
    }

    async function initFormatter() {
        const { AsYouType } = await import('libphonenumber-js');
        const country = props.country as CountryCode;
        formatter = new AsYouType(country);
        updatePhone();
    }

    function updatePhone(value?: string | null) {
        if (value == null) {
            value = field.value ?? '';
        }

        const input = inputElement.value;
        if (!input) {
            return;
        }

        if (!formatter) {
            input.value = value;
            return;
        }

        formatter.reset();
        value = formatter.input(value);

        // If you start writing telephone without prefix
        // by default formatter will make it stay that way.
        // But we want to emphasize the prefix,
        // so we force it to display with prefix.
        if (!value.startsWith('+')) {
            const international = formatter.getNumber()?.formatInternational();
            if (international) {
                formatter.reset();
                value = formatter.input(international);
            }
        }

        let selectionStart = input.selectionStart ?? input.value.length;
        let selectionEnd = input.selectionEnd ?? selectionStart;

        selectionStart = calculateSelection(selectionStart, input.value, value);
        selectionEnd = calculateSelection(selectionEnd, input.value, value);

        if (field.value !== value) {
            field.value = value;
        }

        input.value = value;
        input.setSelectionRange(selectionStart, selectionEnd);
    }

    function calculateSelection(position: number, oldValue: string, newValue: string) {
        // Because we autofill country prefix, we calculate cursor position from the end.
        // Also, because there may be some spaces in formatted text, we take into account
        // only digits.
        let digitsFromEnd = 0;
        for (let i = oldValue.length - 1; i >= position; i--) {
            if (isDigitOrPlus(oldValue[i]!)) {
                digitsFromEnd++;
            }
        }

        let newPosition = newValue.length;
        for (let i = newValue.length - 1; i >= 0; i--) {
            if (digitsFromEnd <= 0) {
                if (isDigitOrPlus(newValue[i]!)) {
                    break;
                }
            } else if (isDigitOrPlus(newValue[i]!)) {
                digitsFromEnd--;
            }

            newPosition--;
        }

        return newPosition;
    }

    function isDigitOrPlus(c: string) {
        return c === '+' || isDigit(c);
    }

    function onInput(event: Event) {
        const target = event.target as HTMLInputElement;
        updatePhone(target.value);
    }
}
