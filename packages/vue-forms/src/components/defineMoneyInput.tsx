import { computed, h } from 'vue';
import { IMaskComponent } from 'vue-imask';

import { CURRENCIES, type Currency, denormalizeMoney, normalizeMoney } from '@nzyme/money';
import { defineProps, useProps } from '@nzyme/vue-utils';

import { defineFormField } from './defineFormField.js';

export type MoneyInputOptions = {
    currency: Currency;
};

/**
 *
 * @__NO_SIDE_EFFECTS__
 */
export function defineMoneyInput() {
    const fieldDef = defineFormField(Number);
    const propsDef = defineProps({
        ...fieldDef.props,
        label: String,
        placeholder: String,
        tabindex: Number,
        disabled: Boolean,
        readonly: Boolean,
    });

    return {
        props: propsDef,
        emits: fieldDef.emits,
        setup,
    };

    function setup(options: MoneyInputOptions) {
        const props = useProps(propsDef);
        const field = fieldDef.create({ props });

        const value = computed(() => {
            const money = props.modelValue;
            if (money == null) {
                return 0;
            }

            return denormalizeMoney(money, options.currency);
        });

        const currency = computed(() => CURRENCIES[options.currency]);

        const mask = computed(() => `num\u00A0${currency.value.symbol}`);
        const blocks = computed(() => ({
            num: {
                mask: Number,
                thousandsSeparator: '\u00A0',
                radix: currency.value.fractionSymbol,
                scale: currency.value.fractionDigits,
            },
        }));

        function onInput(value: null | number) {
            field.value = value != null ? normalizeMoney(value, options.currency) : null;
        }

        return {
            field,
            component,
        };

        function component() {
            return (
                <IMaskComponent
                    aria-label={props.label}
                    blocks={blocks.value}
                    disabled={props.disabled}
                    inputmode="numeric"
                    lazy={false}
                    mask={mask.value}
                    onBlur={field.inputAttrs.onBlur}
                    onFocus={field.inputAttrs.onFocus}
                    onUpdate:typed={onInput}
                    placeholder={props.placeholder}
                    readonly={props.readonly}
                    tabindex={props.tabindex}
                    title={props.label}
                    typed={value.value}
                />
            );
        }
    }
}
