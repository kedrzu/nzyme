import { computed, h } from 'vue';
import { IMaskComponent } from 'vue-imask';

import { CURRENCIES, denormalizeMoney, normalizeMoney } from '@nzyme/money';
import type { Currency } from '@nzyme/money';
import { assignProps } from '@nzyme/utils';
import { defineProps, useProps } from '@nzyme/vue-utils';

import { defineFormField } from './defineFormField.js';

export type MoneyInputOptions = {
    currency: Currency;
};

const MONEY_FIELD = defineFormField(Number);
const MONEY_PROPS = defineProps({
    ...MONEY_FIELD.props,
    label: String,
    placeholder: String,
    tabindex: Number,
});

/**
 *
 */
export const useMoneyInput = assignProps(setupMoneyInput, {
    props: MONEY_PROPS,
    emits: MONEY_FIELD.emits,
});

/**
 *
 * @__NO_SIDE_EFFECTS__
 */
function setupMoneyInput(options: MoneyInputOptions) {
    const props = useProps(MONEY_PROPS);
    const field = MONEY_FIELD.create({ props });

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

    function onInput(value: number | null) {
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
                aria-readonly={props.readonly}
                aria-required={props.required}
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
