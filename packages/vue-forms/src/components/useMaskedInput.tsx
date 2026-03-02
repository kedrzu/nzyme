import type { FactoryArg } from 'imask';
import { computed, h } from 'vue';
import type { InputHTMLAttributes, MaybeRefOrGetter } from 'vue';
import { IMaskComponent } from 'vue-imask';

import { assignProps } from '@nzyme/utils/assignProps.js';
import { defineProps } from '@nzyme/vue-utils/defineProps.js';
import { makeRef } from '@nzyme/vue-utils/reactivity/makeRef.js';
import { useProps } from '@nzyme/vue-utils/useProps.js';

import { defineFormField } from './defineFormField.js';
import type { FormFieldValue } from './defineFormField.js';

/**
 *
 */
export interface MaskedInputMaskConfig {
    /** The mask configuration for IMask */
    mask: FactoryArg;
    /** Optional blocks configuration for IMask */
    blocks?: Record<string, unknown>;
    /** Whether to use lazy mode (default: false) */
    lazy?: boolean;
    /** Input mode for mobile keyboards */
    inputmode?: 'decimal' | 'email' | 'numeric' | 'search' | 'tel' | 'text' | 'url';
    /** Placeholder character */
    placeholderChar?: string;
}

/**
 *
 */
export interface MaskedInputOptions<T = unknown> {
    /** Mask configuration */
    maskConfig: MaybeRefOrGetter<MaskedInputMaskConfig>;
    /** Function to convert typed value to model value */
    toModelValue: (typedValue: unknown) => FormFieldValue<T>;
    /** Function to convert model value to typed value for display */
    toTypedValue: (modelValue: FormFieldValue<T> | null | undefined) => unknown;
}

/**
 *
 */
export const useMaskedInput = defineMaskedInput();

/**
 *
 */
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
        const { toModelValue, toTypedValue } = options;
        const mask = makeRef(options.maskConfig);
        const props = useProps(propsDef);
        const field = fieldDef.create({ props });
        const typedValue = computed(() => toTypedValue(field.value));

        return {
            field,
            MaskedInput,
        };

        function MaskedInput(attrs: InputHTMLAttributes) {
            return (
                <IMaskComponent
                    aria-label={props.label}
                    aria-readonly={props.readonly}
                    aria-required={props.required}
                    blocks={mask.value.blocks}
                    disabled={props.disabled}
                    inputmode={mask.value.inputmode ?? 'text'}
                    key={mask.value}
                    lazy={mask.value.lazy ?? false}
                    mask={mask.value.mask}
                    onBlur={field.inputAttrs.onBlur}
                    onFocus={field.inputAttrs.onFocus}
                    onUpdate:typed={onInput}
                    placeholder={props.placeholder}
                    placeholderChar={mask.value.placeholderChar}
                    readonly={props.readonly}
                    tabindex={props.tabindex}
                    title={props.label}
                    typed={typedValue.value}
                    {...attrs}
                />
            );
        }

        function onInput(value: unknown) {
            field.value = toModelValue(value);
        }
    }
}
