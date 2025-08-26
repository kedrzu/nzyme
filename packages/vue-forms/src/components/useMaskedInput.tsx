import { computed, h } from 'vue';
import { IMaskComponent } from 'vue-imask';
import type { FactoryArg } from 'imask';

import { defineProps, useProps } from '@nzyme/vue-utils';

import { defineFormField, type FormFieldValue } from './defineFormField.js';
import { assignProps } from '@nzyme/utils';

export interface MaskedInputMaskConfig {
    /** The mask configuration for IMask */
    mask: FactoryArg;
    /** Optional blocks configuration for IMask */
    blocks?: Record<string, unknown>;
    /** Whether to use lazy mode (default: false) */
    lazy?: boolean;
    /** Input mode for mobile keyboards */
    inputmode?: 'text' | 'numeric' | 'decimal' | 'tel' | 'search' | 'email' | 'url';
    /** Placeholder character */
    placeholderChar?: string;
}

export interface MaskedInputOptions<T = unknown> {
    /** Mask configuration */
    maskConfig: MaskedInputMaskConfig;
    /** Function to convert typed value to model value */
    toModelValue: (typedValue: unknown) => FormFieldValue<T>;
    /** Function to convert model value to typed value for display */
    toTypedValue: (modelValue: FormFieldValue<T> | null | undefined) => unknown;
}

export const useMaskedInput = defineMaskedInput();

export function defineMaskedInput<T = string>() {
    const fieldDef = defineFormField<T>();
    const propsDef = defineProps({
        ...fieldDef.props,
        label: String,
        placeholder: String,
        tabindex: Number,
    });

    return assignProps(setup, {
        props: propsDef,
        emits: fieldDef.emits,
    });

    /**
     * Sets up a masked input with the provided configuration.
     *
     * @param options - Configuration options for the masked input
     */
    function setup(options: MaskedInputOptions<T>) {
        const { maskConfig, toModelValue, toTypedValue } = options;
        const props = useProps(propsDef);
        const field = fieldDef.create({ props });
        const typedValue = computed(() => toTypedValue(field.value));

        return {
            field,
            MaskedInput,
        };

        function MaskedInput() {
            return (
                <IMaskComponent
                    aria-label={props.label}
                    aria-readonly={props.readonly}
                    aria-required={props.required}
                    blocks={maskConfig.blocks}
                    disabled={props.disabled}
                    inputmode={maskConfig.inputmode ?? 'text'}
                    lazy={maskConfig.lazy ?? false}
                    mask={maskConfig.mask}
                    onBlur={field.inputAttrs.onBlur}
                    onFocus={field.inputAttrs.onFocus}
                    onUpdate:typed={onInput}
                    placeholder={props.placeholder}
                    readonly={props.readonly}
                    tabindex={props.tabindex}
                    title={props.label}
                    typed={typedValue.value}
                    placeholderChar={maskConfig.placeholderChar}
                />
            );
        }

        function onInput(value: unknown) {
            field.value = toModelValue(value);
        }
    }
}
