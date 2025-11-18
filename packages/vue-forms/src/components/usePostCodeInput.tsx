import { computed, h, type InputHTMLAttributes, type PropType } from 'vue';
import { IMaskComponent } from 'vue-imask';
import type { FactoryArg } from 'imask';

import { CountryCode } from '@nzyme/i18n';
import { assignProps } from '@nzyme/utils';
import { defineProps, useProps } from '@nzyme/vue-utils';

import { defineFormField } from './defineFormField.js';

const DEFAULT_MASK = /^[\w\s-]+$/;

/**
 * Postal code mask configurations for different countries.
 */
const POST_CODE_MASKS: Partial<Record<CountryCode, string | RegExp>> = {
    PL: '00-000',
    DE: '00000',
    US: '00000[-0000]',
};

const fieldDef = defineFormField<string>();
const POST_CODE_PROPS = defineProps({
    ...fieldDef.props,
    country: String as PropType<CountryCode>,
    label: String,
    placeholder: String,
    tabindex: Number,
});

/**
 * Creates a post code input component with country-specific formatting.
 * Uses IMask for input masking and formatting.
 */
export const usePostCodeInput = assignProps(setupPostCodeInput, {
    props: POST_CODE_PROPS,
    emits: fieldDef.emits,
});

/**
 * Sets up a post code input with country-specific formatting.
 *
 * @__NO_SIDE_EFFECTS__
 */
function setupPostCodeInput() {
    const props = useProps(POST_CODE_PROPS);
    const field = fieldDef.create({ props });

    const mask = computed<FactoryArg>(() => {
        const countryCode = props.country?.toUpperCase() as CountryCode;
        if (!countryCode) {
            return DEFAULT_MASK;
        }

        const countryMask = POST_CODE_MASKS[countryCode];
        return countryMask ?? DEFAULT_MASK;
    });

    return {
        field,
        PostCodeInput,
    };

    function PostCodeInput(attrs: InputHTMLAttributes) {
        return (
            // We need to use key to force re-render when the mask changes
            // otherwise the input will not be updated
            <IMaskComponent
                aria-label={props.label}
                aria-readonly={props.readonly}
                aria-required={props.required}
                autocomplete="postal-code"
                disabled={props.disabled}
                inputmode="text"
                key={mask.value}
                lazy={true}
                mask={mask.value}
                name="postal-code"
                onBlur={field.inputAttrs.onBlur}
                onFocus={field.inputAttrs.onFocus}
                onUpdate:value={onInput}
                placeholder={props.placeholder}
                readonly={props.readonly}
                tabindex={props.tabindex}
                title={props.label}
                value={field.value ?? ''}
                {...attrs}
            />
        );
    }

    function onInput(value: string) {
        field.value = value && value.trim() !== '' ? value : null;
    }
}
